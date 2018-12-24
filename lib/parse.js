"use strict"

// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var SEQUENCE_CODE = 1
var STRING_CODE = 2
var NUMBER_CODE = 3

// these are the starting codes (structures also use this space) for complete types
var METADATA_TYPE = 0
var ARRAY_TYPE = 1
var REFERENCING_TYPE = 2
var NUMBER_TYPE = 3
var DEFAULT_TYPE = 4
var EXTENSIONS = 5

var NULL = 0
var UNDEFINED = 1
var TRUE = 2
var FALSE = 3

// referrer types
var REFERRER_NONE = 0
var REFERRER_NEXT = 1
var REFERRER_CHILD = 2
var REFERRER_PROPERTY = 3

var MAX_LENGTH = 1024*1024*16
var END_SEQUENCE = {}
var PAUSED = {}

function createParser(options) {
	if (!options)
		options = {}
	var offset
	var source
	var property = {}
	var isPartial
	var lastRead
	var properties = []
	var classByName = options.classByName || new Map()
	classByName.set('Map', readMap)
	classByName.set('Set', readSet)
	classByName.set('Date', readDate)
	var currentBlock
	var referrerProperty
	var referrerType
	var pausedState

	function pause(state, lastRead) {
		state.previous = pausedState
		state.resume = true
		pausedState = state
		if (!isPartial)
			throw new Error('Unexpected end of dpack stream')

		if (parser.onResume)
			return // already defined, and we just want to use the one from the top of the call stack
		parser.onResume = function(nextString, isPartialString) {
			// top of the resume stack
			var resumeState = pausedState
			pausedState = null
			parser.onResume = null
			// we slice and add these together to generate an entirely new string
			// so we don't cause a memory leak with redundant strings that a retained a slice parents
			if (lastRead < source.length)
				source = source.slice(lastRead) + nextString
			else {// if we have read all of source, we want to slice and re-concatenate to eliminate the reference to the parent, we really don't want that retained in memory
				source = nextString
			}
			isPartial = isPartialString
			disposedChars += lastRead
			offset = 0
			return readSequence(resumeState.length, resumeState)
		}
		return state.object
	}

	function readSequence(length, thisProperty) {
		if (length > 10) {
			if (length === 11) {
				length = MAX_LENGTH
			} else if (length === 14 || length < 16000000) {
				return readAsBlock(thisProperty)
			}
		}

		var propertyState = 0
		thisProperty = thisProperty || {}
		var previousProperty, property, isArray, object, value, i = 0
		if (thisProperty.resume) { // resuming, thisProperty is the resume state.
			if (thisProperty.previous) {
				// do the previous/upper stack frame first
				readSequence(thisProperty.previous.length, thisProperty.previous)
			}
			i = thisProperty.i
			object = thisProperty.object
			property = thisProperty.property
			previousProperty = thisProperty.previousProperty
			propertyState = thisProperty.propertyState
			thisProperty = thisProperty.thisProperty
			isArray = thisProperty.type === 1/*ARRAY_TYPE*/
		} else {
			isArray = thisProperty.type === 1/*ARRAY_TYPE*/
			object = thisProperty.constructs ? new thisProperty.constructs() : isArray ? [] : {} // TODO: we could probably construct a new reader that does this a little faster
			if (previousProperty) {
				property = previousProperty.next
			} else {
				property = thisProperty.child
			}
		}
		for (; i < length;) {
			var type, number
			var token = source.charCodeAt(offset++)
			if (token >= 0x40) { // fast path for one byte with stop bit
				if (token > 0x4000) { // long-token handling
					type = (token >>> 12) & 3
					number = token & 0xfff
				} else {
					type = (token >>> 4) & 3
					number = token & 0xf
				}
			} else {
				type = (token >>> 4) & 11 // shift and omit the stop bit (bit 3)
				number = token & 0xf
				token = source.charCodeAt(offset++)
				number = (number << 6) + (token & 0x3f) // 10 bit number
				if (!(token >= 0x40)) {
					token = source.charCodeAt(offset++)
					number = (number << 6) + (token & 0x3f) // 16 bit number
					if (!(token >= 0x40)) {
						token = source.charCodeAt(offset++)
						number = (number << 6) + (token & 0x3f) // 22 bit number
						if (!(token >= 0x40)) {
							token = source.charCodeAt(offset++)
							number = (number << 6) + (token & 0x3f) // 28 bit number
							if (!(token >= 0x40)) {
								token = source.charCodeAt(offset++)
								number = (number * 0x40) + (token & 0x3f) // 34 bit number (we can't use 32-bit shifting operators anymore)
								if (!(token >= 0x40)) {
									token = source.charCodeAt(offset++)
									number = (number * 0x40) + (token & 0x3f) // 40 bit number
									if (!(token >= 0x40)) {
										token = source.charCodeAt(offset++)
										number = (number * 0x40) + (token & 0x3f) // 46 bit number, we don't go beyond this
										if (!(token >= 0)) {
											if (offset > source.length) {
												return pause({
													length: length,
													thisProperty: thisProperty,
													i: i,
													object: object,
													property: property,
													previousProperty: previousProperty,
													propertyState: propertyState,
												}, offset - 8)
											}
										}
									}
								}
							}
						}
					}
				}
			}
			if (type > 1) {
				if (type === 2 /*STRING_CODE*/) {
					value = source.slice(offset, offset += number)
					if (offset > source.length) {
						return pause({
							length: length,
							thisProperty: thisProperty,
							i: i,
							object: object,
							property: property,
							previousProperty: previousProperty,
							propertyState: propertyState,
						}, offset - number)
					}
					if (property.type === NUMBER_TYPE && propertyState < 2) {
						value = +value
					}
				} else { /*NUMBER_CODE*/
					if (number >= 4) {
						value = number - 4
					} else if (number === 0) {
						value = null
					} else if (number === 2) {
						value = true
					} else if (number === 3) {
						value = false
					} else {
						value = undefined
					}
				}
			} else if (type === 1) { /*SEQUENCE_CODE*/
				if (number === 13) { // end sequence
					return object
				}
				value = readSequence(number, property)
			} else { /*PROPERTY_CODE*/
				// we store the previous property state in token, so we can assign the next one
				token = propertyState
				if (number < 6) {
					if (number === METADATA_TYPE) {
						// always use existing property
						propertyState = 3 // read next value as the metadata parameter
					} else {
						if (propertyState === 0) {
							// creating new property
							property = {
								next: null // preallocated this helps with performance
							}
						} else if (property.values) {
							// else if it is preceeded by a reference type, we just modify it
							property.values = null // reset this
						}
						property.type = number
						propertyState = 2 // read next value as the key
						if (number === 2/*REFERENCING_TYPE*/) {
							property.values = []
						} else if (number === ARRAY_TYPE) {
							property.child = {
								type: DEFAULT_TYPE,
								key: null,
							}
						}
					}
				} else {
					if (propertyState === 0) {
						property = properties[number]
						if (!property) {
							property = properties[number] = {
								index: number,
							}
						}
					} else if (properties[number]) {
						property.values = properties[number].values
						// property.type = properties[number].type // do we need to do this?
					}

					propertyState = 1
				}
				if (token === 0) {
					if (!previousProperty) { // in array mode, will never have a previousProperty defined
						thisProperty.child = property
					} else {
						previousProperty.next = property
					}
				}
				continue
			}
			if (propertyState > 0) {
				// 0: normal
				if (propertyState === 1) { // 1: property reference
					propertyState = 0
				}
				else if (propertyState === 2) { // property key
					propertyState = 1
					property.key = value
					continue // read next value as the property value
				} else { // 3: metadata paramater
					propertyState = 1
					var extendedType = classByName.get(value)
					if (extendedType) {
						if (extendedType.fromValue) {
							property.fromValue = extendedType.fromValue
						} else {
							property.constructs = extendedType
						}
					} else if (options.errorOnUnknownClass) {
						throw new Error('Attempt to deserialize to unknown class ' + parameter)
					} else {
					//	readingProperty.readValue = readAsDefault
					}
					continue // read next value as the property value
				}
			}
			if (property) {
				if (property.type === 2/*REFERENCING_TYPE*/) {
					var values = property.values
					if (type === NUMBER_CODE && number > 3) {
						value = values[value]
						if (value === undefined && !((number - 4) in values)) {
							value = forwardReference(number, values) // forward referencing
						}
					} else {
						if (values.index > -1) {
							// we use this path for fulfilling forward references
							values[values.index++] = value
						} else {
							values.push(value)
						}
					}
				}
				if (property.fromValue) {
					value = property.fromValue(value)
				}
				if (isArray) {
					if (property.key === null) {
						object.push(value)
					}
					else if (property.key !== undefined && value !== undefined) {
						object[property.key] = value
					} else {
						i-- // undefined key, skip and don't iterate
					}
				} else if (value !== undefined) { // TODO: declare undefined locally?
/*					if (!property) {
						throw new Error('No property defined for property in slot ' +  ' value: ' + value)
					}*/
					var key = property.key
					if (key)
						object[key] = value
					else {
						if (key === null) {
							// for objects null indicates replacing the parent object
							object[0] = value
						} else if (key !== undefined) {
							// could be '', 0, or false, all valid keys, only undefined should be skipped
							object[key] = value
						} else {
							i-- // undefined key, skip and don't iterate
						}
					}
					previousProperty = property
					property = previousProperty.next
				}
			}
			i++
		}
		return object
	}


	function copyOnWrite(properties) {
		return properties
	}

	function readAsBlock(property) {
		var parentProperties = properties
		var value
		if (property.resume) {
			properties = property.properties
			value = readSequence(property.previous.length, property.previous)[0]
			value = property.object || value
		} else {
			value = readSequence(1, {
				child: {
					type: 4,
					key: null
				}
			})[0]
		}
		if (pausedState) {
			pause({
				length: 10000,
				thisProperty: property,
				properties: properties,
				object: value
			})
		}
		properties = parentProperties
		return value
	}

	function forwardReference(number, values) {
		var object = {}
		values.index = values.index === undefined ? values.length : values.index // make sure we are using index property for maintaining location, since length will change with the property definition
		Object.defineProperty(values, number - 4, {
			set: function(value) {
				Object.assign(object, value)
				if (value && value.constructor === Array) {
					object.length = value.length
					Object.setPrototypeOf(object, Object.getPrototypeOf(value)) // do our best to make it array like
				}
				Object.defineProperty(values, number - 4, {
					value: value,
					configurable: true
				})
				return value
			},
			get: function(value) {
				return object
			},
			configurable: true
		})
		return object
	}

	function unknownType(number) {
		throw new Error('Unknown type ' + number)
	}

	var unfulfilledReferences = 0
	var disposedChars = 0
	function read(result) {
		return readSequence(1, {
			child: {
				type: 4,
				key: null
			}
		})[0]
	}

	var parser = {
		setSource: function(string, startOffset, isPartialString) {
			source = string
			offset = startOffset || 0
			disposedChars = 0
			isPartial = isPartialString
			return this
		},
		hasMoreData: function() {
			return source.length > offset
		},
		isPaused: function() {
			return pausedState
		},
		hasUnfulfilledReferences: function() {
			return unfulfilledReferences > 0
		},
		getOffset: function() {
			return offset + disposedChars
		},
		read: read,
		assignValues: function(propertyId, values) {
			properties[propertyId] = {
				readValue: readAsReferencing,
				values: values
			}
		}
	}
	return parser
}
exports.parse = function(stringOrBuffer, options) {
	var source
	if (typeof stringOrBuffer === 'string') {
		source = stringOrBuffer
	} else if (stringOrBuffer && stringOrBuffer.toString) {
		source = stringOrBuffer.toString(options && options.encoding || 'utf8')
	} else { // whatever (undefined or null or whatever), just return it
		return stringOrBuffer
	}
	var parser = createParser(options).setSource(source)
	return parser.read()
}
exports.parseLazy = function(buffer, parser) {
	if ((buffer[0] & 0x30) === 0x10) {
		return makeBlockFromBuffer(buffer, parser || createParser())
	} else if (parser) {
		return parser.setSource(buffer.toString()).read()
	} else {
		return exports.parse(buffer)
	}
}
exports.createParser = createParser
var makeBlockFromBuffer = require('./Block').makeBlockFromBuffer
var bufferSymbol = require('./Block').bufferSymbol

var readMap = {
	fromValue: function(entries) {
		var map = new Map()
		for (var i = 0, l = entries.length; i < l; i++) {
			var entry = entries[i]
			map.set(entry.key, entry.value)
		}
		return map
	}
}
var readSet = {
	fromValue: function(values) {
		var set = new Set(values)
		if (set.size === 0 && values.length > 0) {
			for (var i = 0, l = values.length; i < l; i++) {
				set.add(values[i])
			}
		}
		return set
	}
}
var readDate = {
	fromValue: function(time) {
		return new Date(time)
	}
}

