"use strict"
// these are the codes that are used to determine the rudimentary type of numbers
const TYPED_ARRAY_CODE = 0
const ARRAY_CODE = 1
const STRING_CODE = 2
const NUMBER_CODE = 3

// these are the starting codes (structures also use this space) for complete types
const DEFAULT_TYPE = 0
const OBJECT_TYPE = 1
const NUMBER_TYPE = 2
const STRING_TYPE = 3
const ARRAY_OF_OBJECT_TYPE = 4
const BLOCK_TYPE = 5
const METADATA_TYPE = 6
const IDENTITY_TYPE = 7

const FALSE = 0
const TRUE = 1
const UNDEFINED = 2

function createSerializer(options) {
	if (!options)
		options = {}
	var maxReferenceableStringLength = options.maxReferenceableStringLength || 2400
	var extendedTypes = options.converterByConstructor
	if (!extendedTypes) {
		extendedTypes = new Map()
	}
	extendedTypes.set(Map, {
		toArray: writeMap
	})
	extendedTypes.set(Set, {
		toArray: writeSet
	})
	extendedTypes.set(Date, {
		toArray: writeDate
	})
	var charEncoder = (typeof global != 'undefined' && global.Buffer) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
	var writeString = charEncoder.writeString
	var writeToken = charEncoder.writeToken
	var writeBuffer = charEncoder.writeBuffer
	var pendingEncodings = []
	var properties = new Map()
	var propertyIndex = 16
	var currentProperty
	var nextStringIndex = 256
	var lastReference = 0
	var nextId = 1
	var structures = new Map()
	var nextStructureIndex = 8
	var strings = new Map()
	var nextStringId = 16
	var structureIndex = 16
	// stores last used structure by *length* of array using that structure
	var recentStructures = []
	var lastReferencedProperties = new Array(16)
	if (options.useImport) {
		//options.useImport
	}

	function writeNull(definition, array) {
		writeToken(TYPED_ARRAY_CODE, 0)
	}
	// write a rudimentary typed array
	function writeTypedArray(definition, array, writer) {
		var l = array.length
		writeToken(TYPED_ARRAY_CODE, l + 1)
		writeStructure(structure)
		for (var i = 0; i < l; i++) {
			writer(array[i])
		}
	}
	// write a rudimentary array
	function writeArray(array, writer, index) {
		var l = array.length
		writeToken(ARRAY_CODE, l)
		for (var i = 0; i < l; i++) {
			writer(array[i], index)
		}
	}
	// write a rudimentary number
	function writeNumber(number) {
		writeToken(NUMBER_CODE, number)
	}
	// write a rudimentary string
	function writeInlineString(string) {
		writeToken(STRING_CODE, string.length)
		writeString(string)
	}

	var fastStrings = []

	// writing any value in string rudimentary type mode
	function writeAsString(value, index) {
		var type = typeof value
		if (type === 'string') {
			var reference = strings.get(value)
			if (reference > -1) {
				var shortRef = ((index || 0) << 4) | (reference & 0xf)
				if (fastStrings[shortRef] == value) {
					reference = reference & 0xf
				} else {
					fastStrings[shortRef] = value
				}
				writeNumber(reference)
			} else {
				fastStrings[((index || 0) << 4) | (nextStringId & 0xf)] = value
				strings.set(value, nextStringId++)
				writeInlineString(value)
			}
		} else if (type === 'object' && value && value.constructor === Array) {
			writeArray(value, writeAsString, index)
		} else {
			writeAsTypedValue(value)
		}
	}

	// writing any value in number rudimentary type mode
	function writeAsNumber(number) {
		var type = typeof number
		if (type === 'number') {
			if (number >>> 0 === number || (number > 0 && number < 0x400000000000 && number % 1 === 0)) {
				// 46 bit unsigned integer
				writeToken(NUMBER_CODE, number)
			} else {
				// decimal number serialized as a string
				var asString = number.toString()
				writeToken(STRING_CODE, asString.length)
				writeString(asString)
			}
		} else if (type === 'object' && number && number.constructor === Array) {
			writeArray(number, writeAsNumber)
		} else {
			writeAsTypedValue(number)
		}
	}

	// writing any value in default rudimentary type mode
	function writeAsDefault(value) {
		var type = typeof value
		if (type === 'number' && (value >>> 0 === value || (value > 0 && value < 0x400000000000 && value % 1 === 0))) {
			// 46 bit unsigned integer
			writeToken(NUMBER_CODE, value + 4)
		} else if (type ==='string') {
			writeInlineString(value)
		} else if (type ==='boolean') {
			writeToken(NUMBER_CODE, value ? TRUE : FALSE)
		} else if (type ==='string') {
			writeInlineString(value)
		} else if (type ==='undefined') {
			writeToken(NUMBER_CODE, UNDEFINED)
		} else if (type === 'object' && value && value.constructor === Array) {
			writeArray(value, writeAsDefault)
		} else {
			writeAsTypedValue(value)
		}
	}

	// this explicitly writes the type of the value, so anything can go through this to finally get written
	function writeAsTypedValue(value) {
		if (typeof value === 'object') {
			if (value) {
				if (value.constructor === Array) {
					// TODO: Find the type of the first value and write out with collapsing when length != 1
					writeToken(TYPED_ARRAY_CODE, 2) // typed array with 2 values, the type and the value
					writeToken(NUMBER_CODE, DEFAULT_TYPE)
					return writeArray(value, writeAsDefault)
				}
				return writeAsObject(value, true) // indicate that it must use typed form
			} else
				return writeNull()
		}
		writeToken(TYPED_ARRAY_CODE, 2) // typed array with 2 values, the type and the value
		var writer = writeType(value)
		writer(value)
	}

	var constructorIndex = 2048

	// writing any value in object rudimentary type mode
	function writeAsObject(object, type) {
		if (typeof object !== 'object') { // if it isn't actually an object, escape through typed value
			writeAsTypedValue(object)
			return
		}
		if (!object) {
			writeToken(0, 0)
			return
		}
		var constructor = object.constructor
		var extendedType
		var notPlainObject = constructor !== Object
		var structureToWrite = []
		var structureIndices = []
		var values = []
		if (notPlainObject) {
			if (constructor === Array) // escape out to typed value
				return writeAsTypedValue(object)
			else if (constructor === serialize.Block)
				return writeBlock(object)
			else if (object.then)
				return writePromise(object)
			else {
				// for extended types, the name goes first
				extendedType = extendedTypes.get(constructor)
				if (extendedType) {
					var name = constructor.name
					if (!extendedType.name) {
						extendedType.name = name
					}
					if (extendedType.toArray) {
						var structureKey = '\0' + name
						var values = extendedType.toArray(object)
						var length = values.length
						var structureDefinition = structures.get(structureKey)
						if (structureDefinition) {
							if (recentStructures[length] === structureDefinition) {
								writeToken(ARRAY_CODE, length)
							} else {
								writeToken(TYPED_ARRAY_CODE, length + 1)
							}
							writeToken(NUMBER_CODE, structureDefinition.index)
						} else {
							writeToken(TYPED_ARRAY_CODE, length + 1)
							structureDefinition = []
							structureDefinition.index = nextStructureIndex++
							structures.set(structureKey, structureDefinition)
							writeToken(ARRAY_CODE, 2)
							writeNull()
							writeInlineString(name)
						}
						recentStructures[length] = structureDefinition
						for (var i = 0; i < length;) {
							writeAsDefault(values[i], i += 1)
						}
						return
					}
				} else {
					extendedTypes.set(constructor, extendedType = { name: name })
				}
				var stringIndex = extendedType.index || (extendedType.index = constructorIndex++)
				structureIndices.push(stringIndex)
			}
		}
		for (var key in object) {
			if (notPlainObject && !object.hasOwnProperty(key)) { // skip inherited properties, but skip inheritance check for plain objects
				continue
			}
			var value = object[key]
			var stringIndex = strings.get(key)
			if (stringIndex > -1) {
				structureToWrite.push(stringIndex)
			} else {
				strings.set(key, stringIndex = nextStringId++)
				structureToWrite.push(key)
			}
			structureIndices.push(stringIndex)
			values.push(value)
		}
		var length = values.length
		var structureKey = String.fromCodePoint.apply(null, structureIndices)

		var structureDefinition = structures.get(structureKey)
		if (structureDefinition) {
			// existing structure, reference it
			if (type) {
				if (type === structureDefinition) {
					// if this has a type defined by the property, and it matches, we can use a plain array
					writeToken(ARRAY_CODE, length)
				} else {
					// use a typed array
					writeToken(TYPED_ARRAY_CODE, length + 1)
					writeToken(NUMBER_CODE, structureDefinition.index)
				}
			} else {
				var recentStructure = recentStructures[length]
				// if it is a match, we can use the shorter reference with a plain array
				if (recentStructure === structureDefinition) {
					writeToken(ARRAY_CODE, length)
				} else {
					// use a typed array
					writeToken(TYPED_ARRAY_CODE, length + 1)
					writeToken(NUMBER_CODE, structureDefinition.index)
				}
			}
		} else {
			// write out the structure, as a typed array
			structureDefinition = []
			structureDefinition.index = nextStructureIndex++
			writeToken(TYPED_ARRAY_CODE, length + 1) // the initial "type" entry is the structure
			if (extendedType) {
				writeToken(ARRAY_CODE, (length + 1) * 2) // start with structure name, and then the length of the structure, with alternating key, types
				writeNull() // the key for constructor name entry
				writeInlineString(extendedType.name) // the name
				structureIndices.shift() // remove the constructor name entry, the indices line up right the next part
			} else {
				writeToken(ARRAY_CODE, length * 2) // the length of the structure, with alternating key, types
			}
			for (var i = 0; i < length; i++) {
				// write the key
				var propertyToWrite = structureToWrite[i]
				if (typeof propertyToWrite === 'number') {
					fastStrings[propertyToWrite & 0xf] = strings.get(propertyToWrite)
					writeNumber(propertyToWrite)
				}
				else if (propertyToWrite) {
					fastStrings[structureIndices[i] & 0xf] = propertyToWrite
					writeInlineString(propertyToWrite)
				}
				// write the type, getting the writer
				structureDefinition.push(writeType(values[i]))
			}
			structures.set(structureKey, structureDefinition)
			if (length === 1) {
				// if the length is 1, we need to write as an array to disambiguate from a primitive alue
				writeToken(ARRAY_CODE, 1)
			}
		}
		recentStructures[length] = structureDefinition
		// the initial token has been written defining the array length, now write out the values
		for (var i = 0; i < length;) {
			var writer = structureDefinition[i]
			writer(values[i], i += 1)
		}
	}

	function writeExtendedType(constructor) {
		var name = constructor.name
		var structure = structures.get(name)
		if (structure) {
			writeNumber(structure.index)
		} else if (extendedTypes.has(constructor)) {
			var structure = []
			structure.index = structures.size
			var writer = structure.writer = extendedTypes.get(constructor)
			structures.set(name, structure)
			writeToken(TYPED_ARRAY_CODE, 1)
			writeAsString(name, 0)
			return writer
		}
		// nothing registered, treat as plain object
		// TODO: still register the type
		writeNumber(OBJECT_TYPE)
		return writeAsObject
	}

	function writeType(value) {
		var type = typeof value
		// write the type
		if (type === 'string') {
			writeNumber(STRING_TYPE)
			return writeAsString
		} else if (type === 'number') {
			writeNumber(NUMBER_TYPE)
			return writeAsNumber
		} else if (type === 'object') {
			if (value) {
				var constructor = value.constructor
				if (constructor === Array) {
					if (value.length > 0) {
						var first = value[0]
						if (first && typeof first === 'object') {
							writeNumber(ARRAY_OF_OBJECT_TYPE) // indicate array of given value
							return writeAsArrayOf(writeAsObject)
						}
						return writeType(first) // for primitive types, the type can be used as an array or single value
					}
					// don't know the type if the array is empty, default to default
					writeNumber(DEFAULT_TYPE)
					return writeAsDefault
				}/* else if (constructor !== Object) {
					return writeExtendedType(constructor)
				}*/
			}
			writeNumber(OBJECT_TYPE)
			return writeAsObject
		} else {
			writeNumber(DEFAULT_TYPE)
			return writeAsDefault
		}
	}

	function writeAsArrayOf(writer) {
		return function(array) {
			if (array && array.constructor === Array) { // check to make sure it is an array
				var length = array.length
				writeToken(ARRAY_CODE, length) // write out the header token
				// write out the elements
				for (var i = 0; i < length; i++) {
					writer(array[i])
				}
			} else { // bail to default mode behavior
				writeAsDefault(array)
			}
		}
	}

	function writeObjectElements(values, structure) {
		var length = values.length
		for (var i = 0; i < length; i++) {
			var type = structureDefinition[i]
			writer(values[0])
		}
	}

	// writing any value in block rudimentary type mode
	function writeAsBlock(value) {
		writeAsTypedValue(value)
	}

	function writeStringProperty(string) {
		if (typeof string === 'object') {
			if (string)
				writeArray(string, writeStringProperty)
			else
				writeToken(0, 0) // null
		} else if (string.length < maxReferenceableStringLength) {
			var values = currentProperty.values
			var stringIndex = values.get(string)
			if (stringIndex === undefined) {
				stringIndex = values.size
				if (stringIndex === 16) {
					// TODO: could implement something where we can rotate through and keep some values, but this is fast and simple for now
					// restart, starting at 0
					stringIndex = 0
					values.clear()
				}
				values.set(string, stringIndex)
				writeInlineString(string)
			} else {
				writeToken(2, stringIndex)
			}
		} else {
			writeToken(0, string.length)
			writeString(string)
		}
	}

	var promisesToStart
	function writePromise(promise) { // in object mode
		var id = nextId++
		writeToken(TYPED_ARRAY_CODE, 2)
		writeNumber(BLOCK_TYPE)
		writeNumber(id)
		var lazyPromise = {
			then: function(callback) {
				return promise.then(function(value) {
/*					if (inLazyDocument) {
						var valueBuffer = writeOpen(value)
						writeToken(0, 13)
						writeFixed(length)
						writeToken(0, 14)
						writeFixed(id)
						writeBuffer(valueBuffer)
					} else
					*/
					writeToken(0, 11) // identified-value
					writeOpen(id)

					var buffer = value && value[bufferSymbol]
					if (buffer) {
						var header = block[headerSymbol]
						if (buffer[0] & 80 === 80) { // block array
							writeToken(ARRAY_CODE, header.headerElements) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
							writeAsDefault(id)
							writeNull() // no imports
							writeNumber(buffer.length) // write length
							writeBuffer(buffer)
						} else {
							writeToken(ARRAY_CODE, 4) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
							writeAsDefault(id)
							writeNull() // no imports
							writeNumber(buffer.length) // write length
							writeBuffer(buffer)
						}
					} else {
						writeToken(ARRAY_CODE, 4) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
						writeAsDefault(id)
						writeNull() // no imports
						writeNumber(0) // unknown
						writeAsBlock(value)
					}
				}, function(error) {
					writeOpen(error.message)
				}).then(callback)
			}
		}
		pendingEncodings.push(lazyPromise)
	}


	function writeBlock(block, writer) {
		var id = nextId++
		writeToken(TYPED_ARRAY_CODE, 2)
		writeNumber(BLOCK_TYPE)
		writeNumber(id)
		var lazyPromise = {
			then: function(callback) {
				var startOffset = charEncoder.getOffset()
				var buffer = block[bufferSymbol]
				var blockHeader = block[headerSymbol]
				if (blockHeader) { // block array
					writeToken(ARRAY_CODE, header.headerElements) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
					writeAsDefault(id)
					writeNull() // no imports
					writeNumber(blockHeader.length) // write length
					writeBuffer(buffer.slice(blockHeader.contentOffset))
				} else {
					writeToken(ARRAY_CODE, 4) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
					writeAsDefault(id)
					writeNull() // no imports
					writeNumber(buffer.length) // write length
					writeBuffer(buffer)
				}
				callback()
			}
		}
		pendingEncodings.unshift(lazyPromise) // put it in front, since it is likely in memory right now
	}

	var serializer = {
		serialize: function(value) {
			var buffer = value && value[bufferSymbol]
			if (buffer) {
				charEncoder.writeBuffer(buffer)
				return
			}
			var startingOffset = charEncoder.getOffset()
			writeAsBlock(value)
			if (pendingEncodings.length > 0 && !options.outlet) {
				// if there are other blocks, and no outlet, we assign a length so lazy character decoding can be used
				var blockBufferLength = charEncoder.getOffset() - startingOffset
				var headerEncoder = (typeof global != 'undefined' && global.Buffer) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
				headerEncoder.writeToken(ARRAY_CODE, pendingEncodings.length + 4) // length-defined value
				headerEncoder.writeToken(TYPED_ARRAY_CODE, 0) // null id
				headerEncoder.writeToken(TYPED_ARRAY_CODE, 0) // null imports
				headerEncoder.writeToken(NUMBER_CODE, 0) // unknown length
				headerEncoder.writeToken(ARRAY_CODE, 4) // the primary block (one element)
				headerEncoder.writeToken(TYPED_ARRAY_CODE, 0) // null id
				headerEncoder.writeToken(TYPED_ARRAY_CODE, 0) // null imports
				headerEncoder.writeToken(NUMBER_CODE, blockBufferLength) // null imports
				charEncoder.insertBuffer(headerEncoder.getSerialized(), startingOffset)
			}
		},
		getSerialized: function() {
			if (pendingEncodings.length > 0) {
				var promises = []
				while (pendingEncodings.length > 0) {
					var finished = false
					var promise = pendingEncodings.shift().then(function() {
						finished = true
					})
					if (!finished) {
						promises.push(promise)
					}
				}
				if (promises.length > 0) {
					return Promise.all(promises).then(function() {
						return serializer.getSerialized()
					})
				}
			}
			return charEncoder.getSerialized()
		},
		getStructures: function() {
			return structures.values()
		},
		flush: charEncoder.flush,
		pendingEncodings: pendingEncodings
	}
	return serializer
}
function serialize(value, options) {
	var serializer = createSerializer(options)
	serializer.serialize(value)
	return serializer.getSerialized()
}
exports.serialize = serialize
exports.createSerializer = createSerializer

function browserCharEncoder() {
	var serialized = ''
	function writeToken(type, number) {
		var serializedToken
		if (number < 0x10) { // 4 bits of number
			serializedToken = String.fromCharCode((type << 4) + number + 0x40)
		} else if (number < 0x400) { // 10 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 6),
				(number & 0x3f) + 0x40)
		} else if (number < 0x10000) { // 16 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 12),
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x400000) { // 22 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 18),
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x10000000) { // 28 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 24),
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x100000000) { // 32 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 30),
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x400000000) { // 34 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number / 0x40000000 >>> 0),
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x10000000000) { // 40 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number / 0x1000000000 >>> 0),
				(number / 0x40000000) & 0x3f,
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x400000000000) { // 46 bits of number (needed for dates!)
			serializedToken = String.fromCharCode(
				(type << 4) + (number / 0x40000000000 >>> 0),
				(number / 0x1000000000) & 0x3f,
				(number / 0x40000000) & 0x3f,
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else {
			throw new Error('Too big of number')
		}
		serialized += serializedToken
	}
	function writeString(string) {
		serialized += string
	}
	function getSerialized() {
		return serialized
	}
	return {
		writeToken: writeToken,
		writeString: writeString,
		//writeBuffer,
		getSerialized: getSerialized,
		//insertBuffer,
		//flush,
		getOffset: function() {// unsupported
			return -1
		}
	}
}

function writeMap(map) {
	return Array.from(map)
}
function writeSet(set) {
	return Array.from(set)
}
function writeDate(date) {
	return [date.getTime()]
}


var bufferSymbol = require('./Block').bufferSymbol
var headerSymbol = require('./Block').headerSymbol
var parsedSymbol = require('./Block').parsedSymbol
