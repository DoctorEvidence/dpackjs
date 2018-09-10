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
	var nextBlockId = 1024
	var structures = new Map()
	var nextPropertyIndex = 16
	var strings = new Map()
	var nextStringId = 16
	var structureIndex = 16
	var property = { structure: [] } // default root property
	// stores last used structure by *length* of array using that structure
	var recentStructures = []
	var lastReferencedProperties = new Array(16)
	if (options.useImport) {
		//options.useImport
	}

	// write a rudimentary array
	function writeArray(array, writer) {
		var l = array.length
		writeToken(SEQUENCE_CODE, l)
		for (var i = 0; i < l; i++) {
			writer(array[i])
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

	// writing any value in string serialization type mode
	function writeAsString(value) {
		var type = typeof value
		if (type === 'string') {
			var strings = property.strings
			var reference = strings.indexOf(value)
			if (reference > -1) {
				writeNumber(reference + 4)
			} else {
				var index = strings.length
				if (index === 12) {
					index = strings.index
					if (!(index < 12)) {
						index = 0
					}
				}
				strings[index] = value
				writeInlineString(value)
			}
		} else if (type === 'object' && value && value.constructor === Array) {
			writeArray(value, writeAsString)
		} else {
			writeTypedValue(value)
		}
	}

	// writing any value in number serialization type mode
	function writeAsNumber(number) {
		var type = typeof number
		if (type === 'number') {
			if (number >>> 0 === number || (number > 0 && number < 0x400000000000 && number % 1 === 0)) {
				// 46 bit unsigned integer
				writeToken(NUMBER_CODE, number + 4)
			} else {
				// decimal number serialized as a string
				var asString = number.toString()
				writeInlineString(asString)
			}
		} else if (type === 'object' && number && number.constructor === Array) {
			writeArray(number, writeAsNumber)
		} else {
			writeTypedValue(number)
		}
	}

	// writing any value in default serialization type mode
	function writeAsDefault(value) {
		var type = typeof value
		if (type === 'string') {
			writeInlineString(value)
		} else if (type === 'number' && number >>> 0 === number || (number > 0 && number < 0x400000000000 && number % 1 === 0)) {
			// 46 bit unsigned integer
			writeToken(NUMBER_CODE, number + 4)
		} else if (type === 'object' && value && value.constructor === Array) {
			writeArray(value, writeAsDefault)
		} else {
			writeTypedValue(value)
		}
	}

	var constructorIndex = 2048

	function writeTypedValue(value) {
		if (value === null)
			writeToken(NUMBER_CODE, NULL)
		else if (value === false)
			writeToken(NUMBER_CODE, FALSE)
		else if (value === true)
			writeToken(NUMBER_CODE, TRUE)
		else if (value === undefined)
			writeToken(NUMBER_CODE, UNDEFINED)
		else {
			writeProperty(value, null).writeValue(value)
		}
	}

	// writing any value in object rudimentary type mode
	function writeAsObject(object) {
		if (!object || typeof object !== 'object' || object.constructor === Array) {
			return writeTypedValue(object)
		}
		if (object.then) {
			return writePromise(object0)
		}
		var values = []
		var keys = Object.keys(object)
		var length = keys.length
		var structure = property.structure
		var evictedProperties = property.evictedProperties
		writeToken(SEQUENCE_CODE, length)
		for (var i = 0; i < length; i++) {
			var key = keys[i]
			var value = object[key]
			var type = typeof value
			var constructor
			var extendedType = false
			if (type === 'object') {
				if (value) {
					constructor = value.constructor
					if (constructor === Object) {
						// leave type as is
					} else if (constructor === Array) {
						var first = value[0]
						type = typeof first
						if (type !== 'string' && type !== 'number') { // string and number can hendle arrays of themselves
							type = 'array'
						}
					} else {
						extendedType = extendedTypes.get(constructor)
						if (extendedType) {
							if (extendedType.toValue) {
								value = extendedType.toValue(value)
								type = typeof value // go through the same logic adjustment here
							}
						} else {
							extendedTypes.set(constructor, {
								name: constructor.name
							})
						}

					}
				} else { // null
					type = 'undefined' // treat null as same type as undefined, both constants
				}
			} else if (type === 'boolean') {
				type = 'undefined'
			}
			property = structure[i]
			if (!property || property.key !== key ||
					(property.type !== type && type !== 'boolean' && type !== 'undefined' && value !== null) ||
					(extendedType && property.extendedType !== constructor)) {
				if (property) {
					evictedProperties[property.index & 7] = property
				}
				property = properties.get(key)
				if (property) {
					if (property.type === type && (!extendedType || property.extendedType === constructor)) { // right type, we can just reference the property
						if (evictedProperties[property.index & 7] === property){
							writeToken(PROPERTY_CODE, (property.index & 7) | 8)
						} else {
							writeToken(PROPERTY_CODE, property.index)
						}
					} else if (property[type]) {
						property = property[type]
						if (evictedProperties[property.index & 7] === property) {
							writeToken(PROPERTY_CODE, (property.index & 7) | 8)
						} else {
							writeToken(PROPERTY_CODE, property.index)
						}
					} else {
						property = property[type] = writeProperty(value, key, type, extendedType)
					}
				} else {
					properties.set(key, property = writeProperty(value, key, type, extendedType))
				}
				structure[i] = property
			}
			property.writeValue(value)
		}
	}

	function writeProperty(value, key, type, extendedType) {
		var property = {
			type: type,
			index: nextPropertyIndex++,
			key: key
		}
		if (type === 'string') {
			writeToken(PROPERTY_CODE, STRING_TYPE)
			property.strings = []
			property.writeValue = writeAsString
		} else if (type === 'number') {
			writeToken(PROPERTY_CODE, NUMBER_TYPE)
			property.writeValue = writeAsNumber
		} else if (type === 'object') {
			writeToken(PROPERTY_CODE, OBJECT_TYPE)
			property.structure = []
			property.evictedProperties = []
			property.writeValue = writeAsObject
		} else if (type === 'array') {
			writeToken(PROPERTY_CODE, ARRAY_OF_OBJECT_TYPE)
			property.elements = {
				type: 'object',
				structure: [],
				evictedProperties: []
				// index: nextPropertyIndex++, // does it get its own index?
			}
			property.writeValue = writeAsArray
		} else if (typeof value === 'boolean') {
			writeToken(PROPERTY_CODE, NUMBER_TYPE)
			property.writeValue = writeAsNumber
		} else {
			writeToken(PROPERTY_CODE, OBJECT_TYPE)
			property.structure = []
			property.evictedProperties = []
			property.writeValue = writeAsObject
		}

		if (extendedType) {
			property.extendedType = extendedType
			writeToken(SEQUENCE_CODE, 2)
			writeInlineString(key)
			writeInlineString(extendedType.name)
		} else if (typeof key === 'string') {
			writeInlineString(key)
		} else {
			writeTypedValue(key)
		}
		return property
	}

	function writeAsArray(array) {
		if (array && array.constructor === Array) { // check to make sure it is an array
			var length = array.length
			writeToken(SEQUENCE_CODE, length) // write out the header token
			var elementsProperty = property.elements // set the current property to the elements property
			// write out the elements
			for (var i = 0; i < length; i++) {
				property = elementsProperty
				writeAsObject(array[i])
			}
		} else { // bail to default mode behavior
			writeTypedValue(array)
		}
	}


	function writeAsArrayOf(writer) {
		return function(array) {
			if (array && array.constructor === Array) { // check to make sure it is an array
				var length = array.length
				writeToken(SEQUENCE_CODE, length) // write out the header token
				// write out the elements
				for (var i = 0; i < length; i++) {
					writer(array[i])
				}
			} else { // bail to default mode behavior
				writeAsDefault(array)
			}
		}
	}

	// writing any value in block rudimentary type mode
	function writeAsBlock(value) {
		writeAsTypedValue(value)
	}


	var promisesToStart
	function writePromise(promise) { // in object mode
		var id = nextBlockId++
		writeToken(NUMBER_CODE, id) // should be in object mode
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
					writeToken(PROPERTY_CODE, id) // identify the block

					var buffer = value && value[bufferSymbol]
					if (buffer) {
						var header = block[headerSymbol]
						if (buffer[0] & 80 === 80) { // block array
							writeToken(SEQUENCE_CODE, header.headerElements) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
							writeAsDefault(id)
							writeNull() // no imports
							writeNumber(buffer.length) // write length
							writeBuffer(buffer)
						} else {
							writeToken(SEQUENCE_CODE, 4) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
							writeAsDefault(id)
							writeNull() // no imports
							writeNumber(buffer.length) // write length
							writeBuffer(buffer)
						}
					} else {
						writeToken(SEQUENCE_CODE, 4) // we should already be in block mode at the top level, so arrays should be interpreted as blocks
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
		var id = nextBlockId++
		writeToken(NUMBER_CODE, id) // should be in object mode
		var lazyPromise = {
			then: function(callback) {
				var startOffset = charEncoder.getOffset()
				var buffer = block[bufferSymbol]
				var blockHeader = block[headerSymbol]
				writeToken(PROPERTY_CODE, id) // identify the block
				writeToken(PROPERTY_CODE, BLOCK_TYPE) // indicate it is a block
				if (blockHeader) { // block array
					writeAsDefault(blockHeader.length) // write length
					writeToken(SEQUENCE_CODE, blockHeader.headerElements)
					writeBuffer(buffer.slice(blockHeader.contentOffset))
				} else {
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
			writeAsObject(value)
			if (pendingEncodings.length > 0 && !options.outlet) {
				// if there are other blocks (and no outlet) the content that we wrote becomes the main block
				var blockBufferLength = charEncoder.getOffset() - startingOffset
				var headerEncoder = (typeof global != 'undefined' && global.Buffer) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
				headerEncoder.writeToken(SEQUENCE_CODE, pendingEncodings.length + 1) // indicate the number of buffer in the top level sequence
				headerEncoder.writeToken(PROPERTY_CODE, OBJECT_TYPE) // define this block as the return/primary block
				headerEncoder.writeToken(NUMBER_CODE, NULL)
				headerEncoder.writeToken(PROPERTY_CODE, BLOCK_TYPE) //  now define the block
				headerEncoder.writeToken(NUMBER_CODE, blockBufferLength + 4) // and define the buffer length (in default mode)
				charEncoder.insertBuffer(headerEncoder.getSerialized(), startingOffset) // and insert this header
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
