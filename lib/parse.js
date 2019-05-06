"use strict"

// type codes:
// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var TYPE_CODE = 3
var STRING_CODE = 2
var NUMBER_CODE = 1
var SEQUENCE_CODE = 7

// constant codes
var NULL = 0 // p
var FALSE = 3 // s
var TRUE = 4 // t
var UNDEFINED = 5 // u

// these are the starting codes (structures also use this space) for complete types
var DEFAULT_TYPE = 6
var ARRAY_TYPE = 7
var REFERENCING_TYPE = 8
var NUMBER_TYPE = 9
var EXTENSIONS = 10
var METADATA_TYPE = 11
var COPY_PROPERTY = 12
var TYPE_DEFINITION = 13  // for defining a typed object without returning the value
var REFERENCE_POSITION = 14 // is this needed?

// sequence codes
var OPEN_SEQUENCE = 12 // <
var PARTIAL_DEFERRED_REFERENCe = 12 // <
var END_SEQUENCE = 14 // >
var DEFERRED_REFERENCE = 15 // ?

var MAX_LENGTH = 1024*1024*16
var PAUSED = {}

function createParser(options) {
	if (!options)
		options = {}
	var offset
	var source
	var isPartial
	var classByName = options.classByName || new Map()
	classByName.set('Map', readMap)
	classByName.set('Set', readSet)
	classByName.set('Date', readDate)
	var pausedState
	var deferredReads

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
		/* propertyStates:
		0 - starting next property slot
		1 - property created, succeeding value should be value of property
		2 - property creation in progress, next value should define key
		11+ - modifying property, next value modifies property (adds metadata, position, type, etc.)
		*/
		var propertyState = 0
		thisProperty = thisProperty || []
		var property, isArray, object, value, i = 0, propertyIndex = 0
		if (thisProperty.resume) { // resuming, thisProperty is the resume state.
			property = thisProperty.previous
			if (property) {
				// do the previous/upper stack frame first
				var value = property.reader ? property.reader(property) : readSequence(property.length, property)
				var values = property.values
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
			i = thisProperty.i || 0
			object = thisProperty.object
			propertyState = thisProperty.propertyState || 0
			propertyIndex = thisProperty.propertyIndex || 0
			thisProperty = thisProperty.thisProperty
			isArray = thisProperty.code === ARRAY_TYPE/*ARRAY_TYPE*/
		} else {
			isArray = thisProperty.code === ARRAY_TYPE/*ARRAY_TYPE*/
			object = object || (thisProperty.constructs ? new thisProperty.constructs() : isArray ? [] : {}) // TODO: we could probably construct a new reader that does this a little faster
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
													propertyIndex: propertyIndex,
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
				propertyState = 0
				continue
			}
			property = thisProperty[propertyIndex]
			if (type === 3) { /*TYPE_CODE*/
				// we store the previous property state in token, so we can assign the next one
				if (number < 6) {
					// special values (constants, deferreds)
					if (number < 3) {
						if (number === 0) {
							value = null
						} else {
							value = 'Unknown token, type: ' + type + ' number: ' + number
						} 
					} else {
						if (number === TRUE) {
							value = true
						} else if (number === FALSE) {
							value = false
						} else {
							value = undefined
						}
					}
				} else {
					if (number <= NUMBER_TYPE) {
						// property definition
						if (propertyState === 1) {
							// we were in property value position, but no value, so we increment position here
							propertyIndex++
							i++
							property = thisProperty[propertyIndex]
						}
						if (property) {
							if (property.values) {
								property.values = null // reset this
							}
							if (property.fromValue) {
								property.fromValue = null // reset this
							}
						} else {
							property = thisProperty[propertyIndex] = []
						}
						property.code = number
//						property.key = null
						propertyState = 2 // read next value as the key
						if (number === REFERENCING_TYPE/*REFERENCING_TYPE*/) {
							property.values = []
						} else if (number === ARRAY_TYPE) {
							property[0] = []
							property[0].code = DEFAULT_TYPE
							property[0].key = null
						}
					} else {
						// property modification
						propertyState = number
					}
					continue
				}
			} else {
				if (type === 2 /*STRING_CODE*/) {
					value = source.slice(offset, offset += number)
					if (offset > source.length) {
						return pause({
							length: length,
							thisProperty: thisProperty,
							i: i,
							object: object,
							propertyIndex: propertyIndex,
							propertyState: propertyState
						}, lastRead)
					}
					if (propertyState < 2) {
						if (property.code === NUMBER_TYPE/*NUMBER_TYPE*/) {
							value = +value
						}
					}
				} else if (type === 1) { /*NUMBER_CODE*/
					value = number
				} else { /*if type == 7 SEQUENCE_CODE*/
					if (number > 13) {
						if (number === END_SEQUENCE)
							return object
						else if (number === DEFERRED_REFERENCE) {
							value = readSequence(0, property)
							if (options.forDeferred) {
								value = options.forDeferred(value, property)
							} else {
								(deferredReads || (deferredReads = [])).push({
									property: property,
									value: value
								})
							}
						}
					} else {
						if (number >= OPEN_SEQUENCE) {
							number = 2000000000
						}
						value = readSequence(number, propertyState === METADATA_TYPE ? [{ key: null, code: 6 }] : property)
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
				}
			}
			if (propertyState < 2 && property && property.code === REFERENCING_TYPE/*REFERENCING_TYPE*/) {
				var values = property.values
				if (typeof value === 'number') {
					value = values[number]
					if (value === undefined && !((number) in values)) {
						value = forwardReference(number, values) // forward referencing
					}					
				} else if (value && value !== true) { // excludes null, undefined, false, '', and true
					if (values.index > -1) {
						// we use this path for fulfilling forward references
						values[values.index++] = value
					} else {
						values.push(value)
					}
				}
			}
			
			if (propertyState > 1) {
				// 0, 1: values are the value of the property
				if (propertyState === 2) { // property key
					property.key = value
				} else if (propertyState === METADATA_TYPE) { // 3: metadata paramater
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
				} else if (propertyState === REFERENCING_POSITION) {
					var values = property.values
					if (values.resetTo == null) {
						// if this is a shared property, want to be able to restore its state
						values.resetTo = values.length
					}
					values.splice(value, values.length)
					values.index = value
				} else if (propertyState === TYPE_ONLY) { // for type-only state
					// throw away this value and read next value as the real value
				} else {
					throw new Error('Unknown property type ' + propertyState)
				}
				propertyState = 1 // property value after definition position
				continue // read next value as the property value
			} else {
				propertyState = 0
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
						object[key == null ? 0 : key] = value
					}
				}
			}
			i++
			if (!isArray)
				propertyIndex++
		}
		return object
	}

	function unknownType(number) {
		throw new Error('Unknown type ' + number)
	}

	var disposedChars = 0
	function read(property) {
		if (property && property.resume) {
			var previous = property.previous
			value = readSequence(previous.length, previous)
			// once we get the value, we don't know which point in the stack could still be resolving
			value = property.object || value
			property = property.property
		} else {
			property = property || [{
				code: 6,
				key: null
			}]
			var value = readSequence(1, property)[0]
		}
		while (true) {
			if (pausedState) {
				return pause({
					reader: read,
					object: value,
					property: property
				})
			}
			if (!deferredReads) {
				return value
			}
			var deferredRead = deferredReads.shift()
			if (!deferredRead) {
				deferredReads = deferredReads.parent
				continue
			}
			var target = deferredRead.value
			var parentDeferredReads = deferredReads
			deferredReads = []
			deferredReads.parent = parentDeferredReads
			var result = readSequence(1, property = [{
				resume: true,
				thisProperty: deferredRead.property,
				object: target
			}])[0]
			if (result != target) { // TODO: Ideally we deal with this by having typed blocks
				// object was replaced with something else (an array, presumably)
				Object.assign(target, result)
				if (result && result.constructor === Array) {
					target.length = result.length
					Object.setPrototypeOf(target, Object.getPrototypeOf(result)) // do our best to make it array like
				}
			}
		}
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
			return deferredReads && deferredReads.length > 0
		},
		getOffset: function() {
			return offset + disposedChars
		},
		read: read
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
	return parser.read(options && options.shared && [options.shared])
}
exports.parseLazy = function(buffer, parser) {
	if ((buffer[0] & 0x80) || // starts with size table
		(buffer[0] >> 4 === 3) || // sequence (object)
		(buffer[0] === 0x77)) { // array type
		return makeBlockFromBuffer(buffer, parser || createParser())
	} else if (parser) { // otherwise, may be a primitive, proactively parse
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

