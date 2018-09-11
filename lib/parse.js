"use strict"

// these are the codes that are used to determine the rudimentary type of numbers
const PROPERTY_CODE = 0
const SEQUENCE_CODE = 1
const STRING_CODE = 2
const NUMBER_CODE = 3

// these are the starting codes (structures also use this space) for complete types
const DEFAULT_TYPE = 0
const OBJECT_TYPE = 1
const STRING_TYPE = 2
const NUMBER_TYPE = 3
const ARRAY_OF_OBJECT_TYPE = 4
const METADATA_TYPE = 5
const BLOCK_TYPE = 6
const EXTENSIONS = 7

const NULL = 0
const UNDEFINED = 1
const TRUE = 2
const FALSE = 3

const MAX_LENGTH = 1024*1024*16
const END_SEQUENCE = {}

function createParser(options) {
	if (!options)
		options = {}
	var offset
	var source
	var property = {
		structure: [],
		evictedProperties: []
	}
	var properties = []
	var lazy = options.lazy
	var classByName = options.classByName || new Map()
	classByName.set('Map', readMap)
	classByName.set('Set', readSet)
	classByName.set('Date', readDate)
	var typeProperty = { index: 0 }
	var parentBlocks = []
	var blocks = []
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

	function arrayToObject(length) {
		if (length > 10) {
			if (length > 11) {
				if (length === 12) {
					hasSeparatorToken = true
				}
				return END_SEQUENCE
			}
			length = MAX_LENGTH
		}
		var structure = property.structure || (property.structure = [])
		var thisProperty = property
		var evictedProperties = property.evictedProperties
		var object = {}
		var value
		for (var i = 0; i < length; i++) {
			var lastProperty = property = structure[i]
			parentProperty = thisProperty
			if (property)
				value = property.readValue()
			else
				value = readAsDefault() // if there is no property defined, hopefully should be a property
			if (property !== lastProperty) {
				structure[i] = property
				if (lastProperty) {
					if (!evictedProperties) {
						evictedProperties = thisProperty.evictedProperties = []
					}
					evictedProperties[lastProperty.index & 7] = lastProperty
				}
			}
			if (value === END_SEQUENCE) {
				break
			} else if (value !== undefined) { // TODO: declare undefined locally?
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
		}
		property = thisProperty
		return object
	}

	function readProperty(reference) {
		var readingProperty
		if (reference < 5) {
			var index = nextPropertyIndex++
			properties[index] = readingProperty = {
				readValue: serializationTypes[reference],
				index: index
			}
			readingProperty.key = readAsDefault()
			if (reference === ARRAY_OF_OBJECT_TYPE) {
				readingProperty.elements = {
					readValue: readAsObject
				}
			}
		} else if (reference < 8) {
			var parameter = readAsDefault()
			if (reference === BLOCK_TYPE) {
				// parameter is the length of the block. In this mode, we ignore it and just keep reading
			}
			readingProperty = {
				readValue: readAsObject,
			}
		} else if (reference < 16) {
			readingProperty = parentProperty.evictedProperties[reference & 7]
		} else {
			readingProperty = properties[reference]
			if (!readingProperty) {
				readingProperty = properties[reference] = {
					index: reference,
					readValue: readAsObject,
					structure: []
				}
			}
		}
		property = readingProperty
		var value = readingProperty.readValue() // reading this can change the current property
		property.value = value
		return value
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
			if (index === 12) {
				index = strings.index
				if (!(index < 12)) {
					index = 0
				}
			}
			strings[index] = string
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

	function readBlockContents(length, i, value) {
		var parentTypes = types
		var parentStrings = strings
		var parentFastStrings = fastStrings
		var lastRead
		try {
			types = types.slice(0, 8)
			strings = []
			fastStrings = []
			parentBlocks = blocks
			blocks = []
			for (i = 0; i < length; i++) {
				lastRead = offset
				var blockValue = readAsBlock()
				if (blockValue !== undefined) {
					value = blockValue
				}
			}
			return value
		} catch (error) {
			handlePossiblePause(error, {
				parser: parser,
				resume: function() {
					offset = lastRead
				},
				resumed: function() {
					return readBlockContents(length, i, value)
				}
			})
		} finally {
			types = parentTypes
			strings = parentStrings
			blocks = parentBlocks
			fastStrings = parentFastStrings
		}
	}

	function readBlockElements(length) {
		var id = readAsDefault()
		var imports = readAsDefault()
		var byteLength = readAsNumber()
		var blockValue = readBlockContents(length - 3, 0)
		if (id === null) {
			// primary value, return it
			return blockValue
		}
		// else the id goes in our blocks map
		var block = blocks[id]
		if (block) {
			Object.assign(block, blockValue)
		} else {
			blocks[id] = blockValue
		}
	}
	var blockMethods = [
		property,
		readBlockElements,
		function(number) {
			var string = readInlineString(number)
			var block = parentBlocks[string]
			if (!block) {
				block = parentBlocks[string] = {}
			}
			return block
		},
		function(number) {
			var block = parentBlocks[number]
			if (!block) {
				block = parentBlocks[number] = {}
			}
			return block
		}
	]
	var readAsBlock = readNext(blockMethods)
	readAsBlock.readTypedElements = readBlockElements

	var serializationTypes = [
		readAsDefault,
		readAsObject,
		readAsString,
		readAsNumber,
		readAsArray(readAsObject),
		null,
		readAsObject,
		null
	]

	var typeMethods = [
		function(length) {
			var type = readAsType()
			return type(length - 1)
		},
		readTypedObject,
		readInlineString,
		function(reference) {
			return types[reference]
		}
	]
	var readAsType = readNext(typeMethods)

	function readTypedObject(length, structure, startingIndex, key) {
		structure = structure || []
		var lastRead
		try {
			property = typeProperty
			var key
			for (var i = startingIndex || 0; i < length; i++) {
				lastRead = offset
				if (i % 2 === 0) {
					key = readAsString()
				} else {
					structure.push({
						index: (i + 1) >>> 1,
						key: key,
						readValue: readAsType()
					})
				}
			}
		} catch (error) {
			handlePossiblePause(error, {
				parser: parser,
				resume: function() {
					offset = lastRead
				},
				resumed: function() {
					return readTypedObject(number, structure, i, key)
				}
			})
		}

		var readObjectElements = function(length, object, index) {
			recentStructures[length] = readObjectElements // store it in recent structures for quick reuse
			object = object || {}
			var lastRead
			try {
				for (var i = 0; i < length; i++) {
					lastRead = offset
					property = structure[i] // scoped outside so it can be used to resolve value
					var key = property.key
					var value = property.readValue()
					if (value !== undefined)
						object[key] = value
				}
			} catch (error) {
				handlePossiblePause(error, {
					parser: parser,
					value: object,
					paused: function(value) {
						object[key] = value
					},
					resume: function() {
						offset = lastRead
						return property.readValue()
					},
					resumed: function(value) {
						object[key] = value
						return readObjectElements(structure.slice(i + 1), object)
					}

				})
			}
			return object
		}
		if (length > 0 && structure[0].key === null) {
			// has a class definition
			var className = structure[0].readValue
			structure.shift()
			var extensionClass = classByName.get(className)
			if (extensionClass.fromArray) {
				var readAndConvertArray = readArray(readAsDefault, extensionClass.fromArray)
				readObjectElements = function(length) {
					recentStructures[length] = readObjectElements // store it in recent structures for quick reuse
					return readAndConvertArray(length)
				}
			} else {
				var readObjectElementsWithClass = readObjectElements
				readObjectElements = function(length) {
					return readObjectElementsWithClass(length, new extensionClass())
				}
			}
		}
		var objectMethods = [
			typedArray,
			readObjectElements,
			objectByReference,
			objectByReference
		]
		var readAsObject = readNext(objectMethods)
		readAsObject.readTypedElements = readObjectElements
		types.push(readAsObject)
		return readAsObject
	}

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
		return function readArray(number, startingArray, startingIndex) {
			var array = startingArray || []
			var arrayProperty = property
			var elementsProperty = property.elements || property
			if (number > 10) {
				if (number > 11) {
					if (number === 12) {
						hasSeparatorToken = true
					}
					return END_SEQUENCE
				}
				number = MAX_LENGTH
			}
			var lastRead
			try {
				for (var i = startingIndex || 0; i < number; i++) {
					lastRead = offset
					property = elementsProperty
					var value = readValue(this)
					if (value === END_SEQUENCE)
						break
					array.push(value)
				}
				if (transform) {
					return transform(array)
				}
				property = arrayProperty
				return array
			} catch (error) {
				var types = this
				handlePossiblePause(error, {
					parser: parser,
					value: array,
					paused: function(value) {
						array.push(value)
					},
					resume: function() {
						offset = lastRead
						return readValue(types)
					},
					resumed: function(value) {
						if (i === array.length) {
							array.push(value) // if we haven't added it yet, do so now
						}
						return readArray(number, array, array.length)
					}
				})
			}
		}
	}

	var strings = []
	var nextPropertyIndex = 16
	var nextStructureIndex = 5
	var referenceableValues = []
	var recentStructures = []

	var unfulfilledReferences = 0
	function objectByReference(reference) {
		if (reference < 4) {
			return readAsNumberOrBoolean(reference)
		}
		var property = properties[reference]
		if (property) {
			return property.value
		} else {
			var object = {}
			property = {
				index: reference,
				readValue: readAsObject,
				structure: []
			}
			Object.defineProperty(property, 'value', {
				set(value) {
					Object.assign(object, value)
					Object.defineProperty('value', { value: value })
					return value
				}
			})
		}
	}
	function read() {
		try {
			var lastRead = offset
			var result = readAsObject()
			while (source.length > offset) {
				lastRead = offset
				readAsBlock() // keep reading through the blocks until we are finished with the input
			}
		} catch(error) {
			if (error.message == 'Unexpected end of dpack stream') {
				handlePossiblePause(error, {
					parser: parser,
					value: result,
					paused: function(value) {
						this.value = result = result || value
					},
					resume: function() {
						offset = lastRead
						return result
					},
					resumed: function() {
						var resumedResult = read()
						return result || resumedResult
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
	var parser = {
		setSource: function(string, startOffset) {
			source = string
			offset = startOffset || 0
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
		blocks: parentBlocks,
		read: read,
		properties: properties
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
	return makeBlockFromBuffer(buffer, parser || createParser({
		lazy: true,
	}))
}
exports.createParser = createParser
var makeBlockFromBuffer = require('./Block').makeBlockFromBuffer
var bufferSymbol = require('./Block').bufferSymbol

var readMap = {
	fromArray: function(entries) {
		var map = new Map(entries)
		if (map.size == 0) {
			for (var i = 0, l = entries.length; i < l; i++) {
				var entry = entries[i]
				map.set(entry[0], entry[1])
			}
		}
		return map
	}
}
var readSet = {
	fromArray: function(values) {
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
	fromArray: function(times) {
		return new Date(times[0])
	}
}

function handlePossiblePause(error, options) {
	if (error.message == 'Unexpected end of dpack stream') {
		var incomingValueInProgress = error.valueInProgress
		var parser = options.parser
		var incomingOnResume = parser.onResume
		if (incomingValueInProgress && options.paused) {
			options.paused(incomingValueInProgress)
		}
		error.valueInProgress = options.value
		parser.onResume = function(updatedString) {
			try {
				if (incomingOnResume) {
					// another resume operation starts
					incomingValueInProgress = incomingOnResume(updatedString)
				} else {
					// top of the resume stack
					parser.onResume = null
					parser.setSource(updatedString)
					incomingValueInProgress = options.resume()
				}
			} catch(error) {
				// if we rethrow before we get back finishing resuming
				handlePossiblePause(error, options)
			}
			return error.valueInProgress = options.resumed(incomingValueInProgress)
		}
	}
	throw error
}
