"use strict"

// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var SEQUENCE_CODE = 1
var STRING_CODE = 2
var NUMBER_CODE = 3

// these are the starting codes (structures also use this space) for complete types
var DEFAULT_TYPE = 4
var ARRAY_TYPE = 5
var REFERENCING_TYPE = 6
var NUMBER_TYPE = 7
var EXTENSIONS = 8
var METADATA_TYPE = 9

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

		if (!parser.onResume) // only if not already defined, otherwise we just want to use the one from the top of the call stack
			parser.onResume = function(nextString, isPartialString, rebuildString) {
				// top of the resume stack
				var resumeState = pausedState
				pausedState = null
				parser.onResume = null
				// we slice and add these together to generate an entirely new string
				// so we don't cause a memory leak with redundant strings that a retained a slice parents
				if (lastRead < source.length)
					source = source.slice(lastRead) + nextString
				else {
					if (rebuildString) // if we have read all of source, we want to slice and re-concatenate to eliminate the slice reference to the parent, we really don't want that retained in memory
						source = nextString.slice(0, 1) + nextString.slice(1)
					else
						source = nextString
				}
				isPartial = isPartialString
				disposedChars += lastRead
				offset = 0
				return resumeState.reader ? resumeState.reader(resumeState) : readSequence(resumeState.length, resumeState)
			}
		return state.object
	}

	function readSequence(length, thisProperty) {
		var propertyState = 0
		thisProperty = thisProperty || []
		var previousProperty, property, isArray, object, value, i = 0, propertyIndex = 0
		if (thisProperty.resume) { // resuming, thisProperty is the resume state.
			previousProperty = thisProperty.previous
			if (previousProperty) {
				// do the previous/upper stack frame first
				var value = previousProperty.reader ? previousProperty.reader(previousProperty) : readSequence(previousProperty.length, previousProperty)
				var values = previousProperty.values
				if (values) {
					// we have an assignment to referencing values that is waiting for pausing to complete
					if (pausedState) {
						// if still paused, pass on to next pausedState
						pausedState.values = values
					} else {
						if (values.index > -1) {
							// we use this path for fulfilling forward references
							values[values.index++] = value
						} else {
							values.push(value)
						}
					}
				}
			}
			i = thisProperty.i
			object = thisProperty.object
			property = thisProperty.property
			previousProperty = thisProperty.previousProperty
			propertyState = thisProperty.propertyState
			thisProperty = thisProperty.thisProperty
			propertyIndex = thisProperty.propertyIndex
			isArray = thisProperty.type === ARRAY_TYPE/*ARRAY_TYPE*/
		} else {
			isArray = thisProperty.type === ARRAY_TYPE/*ARRAY_TYPE*/
			object = thisProperty.constructs ? new thisProperty.constructs() : isArray ? [] : {} // TODO: we could probably construct a new reader that does this a little faster
		}
		for (; i < length;) {
			var type, number
			var lastRead = offset
			var token = source.charCodeAt(offset++)
			if (token >= 0x30) { // fast path for one byte with stop bit
				if (token > 0x3000) { // long-token handling
					type = (token >>> 12) ^ 4
					number = token & 0xfff
				} else {
					type = (token >>> 4) ^ 4
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
												}, lastRead)
											}
										}
									}
								}
							}
						}
					}
				}
			}
			if (type === 0) { /*PROPERTY_CODE*/
				propertyIndex = number
				continue
			}
			property = thisProperty[propertyIndex] || (thisProperty[propertyIndex] = [])
			if (type === 3) { /*TYPE_CODE*/
				// we store the previous property state in token, so we can assign the next one
				if (number < 4) {
					if (number === 0) {
						value = null
					} else if (number === 2) {
						value = true
					} else if (number === 3) {
						value = false
					} else {
						value = undefined
					}
				} else {
					if (number === 13) { // end sequence
						return object
					}
					if (propertyState === 1) {
						property = property[0] // we are modifiying the type of the elements of an arrray
					}
					token = propertyState
					if (number === METADATA_TYPE) {
						// always use existing property
						propertyState = 3 // read next value as the metadata parameter
					} else if (number === 10) {
						propertyState = 2 // read next value as the key
					} else {
						if (propertyState === 0) {
							// creating new property
							property.type = number
							property.key = null
						} else {
							// else if it is preceeded by a reference type, we just modify it
							if (property.values) {
								property.values = null // reset this
							}
							if (property.fromValue) {
								property.fromValue = null // reset this
							}
							property.type = number
						}
						propertyState = 2 // read next value as the key
						if (number === REFERENCING_TYPE/*REFERENCING_TYPE*/) {
							property.values = []
						} else if (number === ARRAY_TYPE) {
							property[0] = []
							property[0].type = DEFAULT_TYPE
							property[0].key = null
							propertyState = 1
						}
					}
					continue
				}
			} else if (type === 2 /*STRING_CODE*/) {
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
					}, lastRead)
				}
				if (propertyState === 0) {
					if (property.type === 3/*NUMBER_TYPE*/) {
						value = +value
					}/* else if (values) {
						if (values.index > -1) {
							// we use this path for fulfilling forward references
							values[values.index++] = value
						} else {
							values.push(value)
						}
					}*/
				}
			} else if (type === 1) { /*NUMBER_CODE*/
/*				if (values) {
					value = values[number]
					if (value === undefined && !((number) in values)) {
						value = forwardReference(number, values) // forward referencing
					}
				} else {*/
					value = number
				//}
			} else { /*if type == 7 SEQUENCE_CODE*/
				if (number > 14) {
					value = readSequence(MAX_LENGTH, property)
				} else {
					value = readSequence(number, property)
				}
				if (pausedState) {
					if (value === undefined) { // or a PAUSED object
						pausedState = null // erase anything further up in the stack, as this means the sequence couldn't start, so we need to re-parse from here
						parser.onResume = null
						return pause({
							length: length,
							thisProperty: thisProperty,
							i: i,
							object: object,
							property: property,
							previousProperty: previousProperty,
							propertyState: propertyState,
						}, lastRead)
					} else {
						// need to assign the values *after* the completion of the sequence if it is a forward reference
						pausedState.values = values
					}
				}/*else if (values) {
					
				}*/
			}
			if (propertyState < 2 && property && property.type === REFERENCING_TYPE/*REFERENCING_TYPE*/) {
				var values = property.values
				if (typeof value === 'number') {
					value = values[number]
					if (value === undefined && !((number) in values)) {
						value = forwardReference(number, values) // forward referencing
					}					
				} else if (values.index > -1) {
					// we use this path for fulfilling forward references
					values[values.index++] = value
				} else {
					values.push(value)
				}
			}
			
			if (propertyState > 1) {
				// 0: normal
				// 1: array
				if (propertyState === 2) { // property key
					propertyState = 0
					property.key = value
					continue // read next value as the property value
				} else { // 3: metadata paramater
					propertyState = 0
					if (typeof value === 'string') {
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
					}
					continue // read next value as the property value
				}
			}
			if (property) {
				if (property.fromValue) {
					value = property.fromValue(value)
				}
				if (isArray) {
					if (property.key === null) {
						object.push(value)
					}
					else if (property.key !== undefined && value !== undefined) {
						object[property.key] = value
					}
				} else {
/*					if (!property) {
						throw new Error('No property defined for property in slot ' +  ' value: ' + value)
					}*/
					if (value !== undefined) { // TODO: declare undefined locally?
						var key = property.key
						if (key)
							object[key] = value
						else {
							if (key == null) {
								// for objects null indicates replacing the parent object
								object[0] = value
							} else /*if (key !== undefined) */{
								// could be '', 0, or false, all valid keys, only undefined should be skipped
								object[key] = value
							}
						}
					}
				}
			}
			i++
			if (!isArray)
				propertyIndex++
		}
		return object
	}

	function backupState(property) {
		property.block = currentBlock
		var backup = {
			original: property,
			type: property.type,
			first: property.first,
			child: property.child,
			fromValue: property.fromValue,
			values: property.values,
		};
		(currentBlock.properties || (currentBlock.properties = [])).push(backup)
	}

	var currentBlock

	function readAsBlock(property) {
		var value
		if (property.resume) {
			parentBlock = property.parentBlock
			var previous = property.previous
			value = readSequence(previous.length, previous)
			// once we get the value, we don't know which point in the stack could still be resolving
			value = property.object || (previous.thisProperty.isBlock ? value[0] : value)
		} else {
			var parentBlock = currentBlock
			currentBlock = {}
			value = readSequence(1, {
				block: currentBlock,
				isBlock: true,
				child: {
					type: 4,
					block: currentBlock,
					key: null
				}
			})[0]
		}
		if (pausedState && value !== undefined) {
			// restore state of property
			if (!property.resume) {

			}
			pause({
				reader: readAsBlock,
				object: value,
				property: property,
				parentBlock: parentBlock
			})
		} else {
			// restore state from beginning of block
			var backups = currentBlock.properties
			if (backups) {
				for (var i = 0, l = backups.length; i < l; i++) {
					var backup = backups[i]
					var original = backup.original
					original.type = backup.type
					original.values = backup.values
					original.fromValue = backup.fromValue
					original.next = backup.next
					original.child = backup.child
					original.block = parentBlock
				}
			}
			var indices = currentBlock.indices
			if (indices) {
				for (var i = 0, l = indices.length; i < l; i++) {
					properties[indices[i]] = null
				}
			}
			currentBlock = parentBlock
		}
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
				type: 2,
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

