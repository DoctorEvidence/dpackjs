"use strict"

// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var SEQUENCE_CODE = 1
var STRING_CODE = 2
var NUMBER_CODE = 3

// these are the starting codes (structures also use this space) for complete types
var DEFAULT_TYPE = 0
var OBJECT_TYPE = 1
var STRING_TYPE = 2
var NUMBER_TYPE = 3
var ARRAY_OF_OBJECT_TYPE = 4
var BLOCK_TYPE = 5
var METADATA_TYPE = 6
var EXTENSIONS = 7

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

function createParser(options) {
	if (!options)
		options = {}
	var offset
	var source
	var property = {}
	var lastRead
	var properties = []
	var objects = []
	var classByName = options.classByName || new Map()
	classByName.set('Map', readMap)
	classByName.set('Set', readSet)
	classByName.set('Date', readDate)
	var currentBlock
	var referrerProperty
	var referrerType
	var readNext = options.utf16 ?
	function readNext(methods) {
		return function readNext() {
			var type, number
			var token = source.charCodeAt(offset++)
			type = token & 3 // last 2 bits for type
			number = token >>> 2 // 12 bit number
			if (token & 0x4000) { // continuation bit
				token = source.charCodeAt(offset++)
				number = ((number & 0xfff) << 14) + (token & 0x3fff) // 26 bit number
				if (token & 0x4000) { // continuation bit
					token = source.charCodeAt(offset++)
					number = (number << 14) + (token & 0x3fff) // 40 bit number
				}

			}
			return methods[type](number)


			var token = source.codePointAt(offset++)
			if (token > 0xffff) {
				offset++ // it takes up two characters
			}
			var number = token >> 2
			var type = token & 3
			if (number >= 0x20000) { // double code point encoding
				number = (number & 0x1ffff) + ((token = source.codePointAt(offset++)) << 17)
				if (token > 0xffff) {
					offset++
				}
			} else if (token === undefined) {
				if (offset > source.length) {
					throw new Error('Unexpected end of dpack stream')
				}
			}
			return methods[type](number)
		}
	} :
	function readNext(methods) {
		return function readNext() {
			var type, number
			var token = source.charCodeAt(offset++)
			if (token >= 0x40) { // fast path for one byte with stop bit
				if (token > 0x4000) // long-token handling
					return methods[(token >>> 12) & 3](token & 0xfff)
				return methods[(token >>> 4) & 3](token & 0xf)
			} else {
				type = (token >>> 4) & 11 // shift and omit the stop bit (bit 3)
				number = token & 0xf
				token = source.charCodeAt(offset++)
				number = (number << 6) + (token & 0x3f) // 10 bit number
				if (token < 0x40) {
					token = source.charCodeAt(offset++)
					number = (number << 6) + (token & 0x3f) // 16 bit number
					if (token < 0x40) {
						token = source.charCodeAt(offset++)
						number = (number << 6) + (token & 0x3f) // 22 bit number
						if (token < 0x40) {
							token = source.charCodeAt(offset++)
							number = (number << 6) + (token & 0x3f) // 28 bit number
							if (token < 0x40) {
								token = source.charCodeAt(offset++)
								number = (number * 0x40) + (token & 0x3f) // 34 bit number (we can't use 32-bit shifting operators anymore)
								if (token < 0x40) {
									token = source.charCodeAt(offset++)
									number = (number * 0x40) + (token & 0x3f) // 40 bit number
									if (token < 0x40) {
										token = source.charCodeAt(offset++)
										number = (number * 0x40) + (token & 0x3f) // 46 bit number, we don't go beyond this
									}
								}
							}
						}
					}
				}
				if (!(token >= 0)) {
					if (offset > source.length) {
						throw new Error('Unexpected end of dpack stream')
					}
				}
				return methods[type](number)
			}
		}
	}
	function readAsNumberOrBoolean(number) {
		if (number >= 4) {
			return number - 4
		} else if (number === 0) {
			return null
		} else if (number === 2) {
			return true
		} else if (number === 3) {
			return false
		}
		// return undefined
	}
	var parentProperty

	function arrayToObject(length, object, previousProperty) {
		if (length > 10) {
			if (length === 11) {
				length = MAX_LENGTH
			} else if (length === 13) {
				return END_SEQUENCE
			} else if (length === 14) {
				return readAsBlock()
			} else if (length === 15) {
				readAsDefault() // read length and discard
				return readAsBlock()
			} else if (length < 16000000) {
				return readAsIdentifiable(length)
			}
		}

		var thisProperty = property || {}
		if (!object)
			object = thisProperty.constructs ? new thisProperty.constructs() : {} // TODO: we could probably varruct a new reader that does this a little faster
		if (previousProperty) {
			property = previousProperty.next
			referrerType = REFERRER_NEXT
			referrerProperty = previousProperty
		} else {
			property = thisProperty.child
			referrerType = REFERRER_CHILD
			referrerProperty = thisProperty
		}
		var value
		try {
			for (var i = 0; i < length; i++) {
				lastRead = offset
				parentProperty = thisProperty
				if (property)
					value = property.readValue()
				else
					value = readAsDefault() // if there is no property defined, hopefully should be a property
				/* if (lastProperty) {
						evictedProperties[lastProperty.index & 7] = lastProperty
					} */
				if (value === END_SEQUENCE) {
					break
				} else if (property) {
					if (value !== undefined) { // TODO: declare undefined locally?
	/*					if (!property) {
							throw new Error('No property defined for property in slot ' +  ' value: ' + value)
						}*/
						var key = property.key
						if (key)
							object[key] = value
						else {
							if (key === null) {
								object = value
							} else if (key !== undefined) {
								// could be '', 0, or false, all valid keys, only undefined should be skipped
								object[key] = value
							}
						}
					}
					referrerProperty = previousProperty = property
					referrerType = REFERRER_NEXT
					property = previousProperty.next
				}
			}
			return object
		} catch (error) {
			handlePossiblePause(error, {
				value: object,
				paused: function(value) {
					if (property) {
						key = property.key
						if (key)
							object[key] = value
						else {
							if (key === null) {
								object = value
							} else if (key !== undefined) {
								// could be '', 0, or false, all valid keys, only undefined should be skipped
								object[key] = value
							}
						}
					}
					i++
					previousProperty = property
				},
				resume: function(value) {
					property = thisProperty
					return arrayToObject(length - i, object, i === 0 ? undefined :
						(previousProperty || {})) // if we are iterating through blocks, there won't be a previous property, but we need to restart in a state iterating through properties
				}

			})
		} finally {
			property = thisProperty
		}
	}

	function readProperty(reference) {
		var readingProperty
		lastRead = offset
		try {
			if (reference < 6) {
				var key = readAsDefault()
				// TODO: When exactly do we increment? (I think only if referrer type is child or next)
				readingProperty = {
					readValue: serializationTypes[reference],
					key: key,
					next: null // preallocated this helps with performance
				}
				if (reference === ARRAY_OF_OBJECT_TYPE) {
					readingProperty.child = {
						readValue: readAsObject,
						key: null,
						next: null,
						child: null
					}
				}
			} else if (reference < 8) {
				var parameter = readAsDefault()
				if (reference === METADATA_TYPE) {
					readingProperty = property // we are augmenting the current property
					var extendedType = classByName.get(parameter)
					if (extendedType.fromValue) {
						readingProperty.readValue = extendedReader(extendedType, readingProperty.readValue)
					} else {
						readingProperty.constructs = extendedType
					}
				}
			} else {
				readingProperty = properties[reference]
				if (!readingProperty) {
					readingProperty = properties[reference] = {
						index: reference,
						readValue: readAsObject,
					}
				}
			}
			if (referrerType === REFERRER_CHILD) {
				referrerProperty.child = readingProperty
			} else if (referrerType === REFERRER_NEXT) {
				referrerProperty.next = readingProperty
			} else if (referrerType === REFERRER_PROPERTY) {
				// copy everything
				referrerProperty.key = readingProperty.key
				referrerProperty.readValue = readingProperty.readValue
				referrerProperty.child = readingProperty.child
				referrerProperty.next = readingProperty.next
				readingProperty = referrerProperty
				// ...
			}
			if (reference >= 8) {
				referrerProperty = readingProperty
				referrerType = REFERRER_PROPERTY
				// return readAsReference()
			}
			lastRead = offset
			property = readingProperty
			var value = readingProperty.readValue() // reading this can change the current property
			if (typeof value === 'object' && value)
				readingProperty.value = value
			return value
		} catch (error) {
			var errorHandler = {
				paused: function(value) {
					this.value = value
				},
				resume: function(value) {
					if (readingProperty) {
						property = readingProperty
						try {
							return property.value = value || readingProperty.readValue() // reading this can change the current property
						} catch(error) {
							handlePossiblePause(error, errorHandler)
						}
					}
					return readProperty(reference)
				}

			}
			handlePossiblePause(error, errorHandler)
		}
	}

	function readAsReference(readingProperty) {
		var lastReferringProperty = referrerProperty
		var lastReferringType = referrerType
		referrerProperty = readingProperty
		referrerType = REFERRER_PROPERTY
		lastRead = offset
		property = readingProperty
		var value = property.readValue() // reading this can change the current property
		referrerProperty = lastReferringProperty
		referrerType = lastReferringType
		readingProperty.value = value
		return value
	}

	function extendedReader(extendedType, reader) {
		return function() {
			return extendedType.fromValue(reader())
		}
	}

	var objectMethods = [
		readProperty,
		arrayToObject,
		readInlineString,
		objectByReference
	]
	var readAsObject = readNext(objectMethods)

	var stringMethods = [
		readProperty,
		0,
		function(number) {
			var string = readInlineString(number)
			var strings = property.strings || (property.strings = [])
			var index = strings.length
			if (index < 12) {
				strings[index] = string
			}
			return string
		},
		referenceString
	]

	var readAsString = readNext(stringMethods)
	readAsString.readTypedElements = stringMethods[1] = readArray(readAsString)

	var defaultMethods = [
		readProperty,
		arrayToObject,
		readInlineString,
		readAsNumberOrBoolean
	]

	var readAsDefault = readNext(defaultMethods)
	stringMethods[1] = readArray(readAsString)
	property.readValue = readAsDefault // reader for root property

	var numberMethods = [
		readProperty,
		0,
		function(number) {
			return +readInlineString(number)
		},
		readAsNumberOrBoolean
	]
	var readAsNumber = readNext(numberMethods)
	readAsNumber.readTypedElements = numberMethods[1] = readArray(readAsNumber)

	function readAsArray(type) {
		var readArrayElements = readArray(type)
		var arrayMethods = [
			readProperty,
			readArrayElements,
			readInlineString,
			readAsNumberOrBoolean
		]
		var readAsArray = readNext(arrayMethods)
		readAsArray.readTypedElements = readArrayElements
		return readAsArray
	}

	function copyOnWrite(properties) {
		return properties
	}

	function readAsIdentifiable(reference) {
		lastRead = offset
		try {
			return objects[reference] = readAsObject()
		} catch(error) {
			handlePossiblePause(error, {
				resume: function(value) {
					if (value) {
						return objects[reference] = value
					}
					return readAsIdentifiable(reference)
				}
			})
		}
	}
	function readAsBlock(block) {
		lastRead = offset
		if (block) {
			var parentObjects = block.parentObjects
			var parentProperties = block.parentProperties
			var parentProperty = block.parentProperty
			property = block.rootProperty
		} else {
			block = currentBlock = {}
			var parentProperties = properties
			var parentObjects = objects
			var parentProperty = block.parentProperty = property
			properties = block.properties ? copyOnWrite(block.properties) : block.properties = []
			objects = block.objects ? copyOnWrite(block.objects) : block.objects = []
			property = block.rootProperty = {}
		}
		try {
			var value = readAsDefault()
			properties = parentProperties
			objects = parentObjects
			property = parentProperty
			return value
		} catch (error) {
			block.parentProperties = parentProperties
			block.parentObjects = parentObjects
			handlePossiblePause(error, {
				paused: function(value) {
					this.value = value
				},
				resume: function(value) {
					if (value) {
						objects = parentObjects
						property = parentProperty
						return value
					}
					return readAsBlock(block)
				}
			})
		} finally {
			property = parentProperty
		}
	}

	var serializationTypes = [
		readAsDefault,
		readAsObject,
		readAsString,
		readAsNumber,
		readAsArray(readAsObject),
		readAsBlock,
		null,
		null
	]


	function classConstructor(className, readObjectElements) {
		classByName.get(className)
		return function(length) {
			if (converter) {
				converter(readAsDefault())
				return readObjectElements(length - 1)
			}
		}
		readObjectElements
	}

	function readInlineString(number) {
		var string = source.slice(offset, offset += number)
		if (offset > source.length) {
			throw new Error('Unexpected end of dpack stream')
		}
		return string
	}

	function readString() {
		property = null
		return readAsString()
	}

	function referenceString(number) {
		if (number < 4) {
			return readAsNumberOrBoolean(number)
		}
		return property.strings[number - 4]
	}

	function unknownType(number) {
		throw new Error('Unknown type ' + number)
	}
	function readArray(readValue, transform) {
		return function readArray(length, array) {
			if (array) {
				var i = array.length
			} else {
				var i = 0
				array = []
			}
			var arrayProperty = property
			property = arrayProperty.child || (arrayProperty.child = arrayProperty)
			if (length > 10) {
				if (length === 11) {
					length = MAX_LENGTH
				} else if (length === 13) {
					return END_SEQUENCE
				} else if (length === 14) {
					return readAsBlock()
				} else if (length === 15) {
					readAsDefault() // read length and discard
					return readAsBlock()
				} else if (length < 16000000) {
					return readAsIdentifiable(length)
				}
			}
			try {
				for (; i < length; i++) {
					referrerProperty = arrayProperty
					referrerType = REFERRER_CHILD
					lastRead = offset

					var value = property.readValue(this)
					if (value === END_SEQUENCE)
						break
					if (property.key !== null && arrayProperty.child !== arrayProperty && property.readValue !== readAsBlock) {
						if (property.key !== undefined)
							array[property.key] = value
					} else {
						array.push(value)
					}
				}
				if (transform) {
					return transform(array)
				}
				property = arrayProperty
				return array
			} catch (error) {
				var types = this
				handlePossiblePause(error, {
					value: array,
					paused: function(value) {
						array.push(value)
					},
					resume: function(value) {
						property = arrayProperty
						return readArray(length, array)
					}
				})
			} finally {
				property = arrayProperty
			}
		}
	}

	var strings = []
	var nextPropertyIndex = 1
	var nextStructureIndex = 5
	var referenceableValues = []
	var recentStructures = []

	var unfulfilledReferences = 0
	function objectByReference(reference) {
		if (reference < 4) {
			return readAsNumberOrBoolean(reference)
		}
		var object = objects[reference]
		if (object) {
			return object
		} else {
			object = {}
			Object.defineProperty(objects, reference, {
				set(value) {
					Object.assign(object, value)
					if (value && value.constructor === Array) {
						object.length = value.length // do our best to make it array like
					}
					Object.defineProperty(objects, reference, {
						value: value,
						configurable: true
					})
					return value
				},
				get(value) {
					return object
				},
				configurable: true
			})
			return object
		}
	}
	function read(result) {
		try {
			lastRead = offset
			var firstToken = source.charCodeAt(offset)
			result = result || readAsDefault()
			if (firstToken === 64 + BLOCK_TYPE) {
				// clear the created block so we don't leak memory in streams
				nextPropertyIndex--
				properties[nextPropertyIndex] = null
			}
		} catch(error) {
			if (error.message == 'Unexpected end of dpack stream') {
				handlePossiblePause(error, {
					value: result,
					paused: function(value) {
						this.value = result = result || value
					},
					resume: function(value) {
						return read(value)
					}
				})
			} else {
				error.message += ' at position ' + parser.getOffset() + ' of ' + source.length
				throw error
			}
		}
		return result
	}
	function passThrough(number) {
		return number
	}
	var readValue = readNext([
		function(number) {
			if (number == 0) {
				return null
			}
			return number
		},
		passThrough,
		readInlineString,
		readAsNumberOrBoolean
	])

	function handlePossiblePause(error, options) {
		if (error.message == 'Unexpected end of dpack stream') {
			var incomingValueInProgress = error.valueInProgress
			var incomingOnResume = parser.onResume
			if (incomingValueInProgress && options.paused) {
				options.paused(incomingValueInProgress)
				options.paused = null // only pause once
			}
			error.valueInProgress = options.value
			parser.onResume = function(updatedString) {
				try {
					if (incomingOnResume) {
						// another resume operation starts
						incomingValueInProgress = incomingOnResume(updatedString)
						if (options.paused) {
							options.paused(incomingValueInProgress)
						}
					} else {
						// top of the resume stack
						parser.onResume = null
						parser.setSource(updatedString)
						offset = lastRead
					}
				} catch(error) {
					// if we rethrow before we get back finishing resuming
					handlePossiblePause(error, options)
				}
				return error.valueInProgress = options.resume(incomingValueInProgress)
			}
		}
		throw error
	}

	var parser = {
		setSource: function(string, startOffset, startingIndex) {
			source = string
			offset = startOffset || 0
			if (startingIndex !== undefined) {
				nextPropertyIndex = startingIndex
			}
			return this
		},
		hasMoreData: function() {
			return source.length > offset
		},
		hasUnfulfilledReferences: function() {
			return unfulfilledReferences > 0
		},
		getOffset: function() {
			return offset
		},
 		readValue: readValue,
		read: read,
		objects: objects
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
		parser.setSource(buffer.toString()).read()
	} else {
		exports.parse(buffer)
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

