"use strict"
// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var TYPE_CODE = 3
var STRING_CODE = 2
var NUMBER_CODE = 1
var SEQUENCE_CODE = 7

// constant codes
var NULL = 0 // p
var UNDEFINED = 1 // q
var TRUE = 2 // r
var FALSE = 3 // s
var DEFERRED_REFERENCE = 4 // t
var END_SEQUENCE = 5 // u

// these are the starting codes (structures also use this space) for complete types
var DEFAULT_TYPE = 6 // v
var ARRAY_TYPE = 7 // w
var REFERENCING_TYPE = 8 // x
var NUMBER_TYPE = 9 // y
var EXTENSIONS = 10 // z
var METADATA_TYPE = 11 // {
var REFERENCING_POSITION = 12 // |
var TYPE_ONLY = 13 // } for defining a typed object without returning the value
var KEY_RENAME = 14 // ~ is this needed?

function createSerializer(options) {
	if (!options)
		options = {}
	var maxReferenceableStringLength = options.maxReferenceableStringLength || 2400
	var extendedTypes = options.converterByConstructor
	if (!extendedTypes) {
		extendedTypes = new Map()
	}
	extendedTypes.set(Map, {
		name: 'Map',
		toValue: writeMap
	})
	extendedTypes.set(Set, {
		name: 'Set',
		toValue: writeSet
	})
	extendedTypes.set(Date, {
		name: 'Date',
		toValue: writeDate
	})
	var charEncoder = (typeof global != 'undefined' && global.Buffer) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
	var writeString = charEncoder.writeString
	var writeToken = charEncoder.writeToken
	var startSequence = charEncoder.startSequence
	var endSequence = charEncoder.endSequence
	var writeBuffer = charEncoder.writeBuffer
	var forProperty = options.forProperty
	var pendingEncodings = []
	var deferredBlocks
	var nextPropertyIndex = 8
	var property

	var writers = [
		0, 1, 2, 3, 4 , 5,
		writeAsDefault,
		writeAsArray,
		writeAsReferencing,
		writeAsNumber,
		writeOnlyNull
	]
	// write a rudimentary array
	function writeArray(array) {
		var length = array.length
		var arrayProperty = property
		if (length > 10) {
			writeToken(SEQUENCE_CODE, 11) // start sequence [
		} else {
			writeToken(SEQUENCE_CODE, length) // write out the header token
		}
		for (var i = 0; i < length; i++) {
			writers[property.code](array[i])
		}
		if (length > 10) {
			writeToken(SEQUENCE_CODE, 13) // end sequence
		}
		property = arrayProperty
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

	// writing any value in referencing serialization type mode
	function writeAsReferencing(value) {
		var values = property.values
		if (values) {
			var reference = values.indexOf(value)
			if (reference > -1) {
				return writeNumber(reference)
			} else if (property.writeSharedValue) {
				if (property.writeSharedValue(value, writeToken))
					return
			} else {
				var index = values.length
				if (index < 12)
					values[index] = value
			}
		}
		var type = typeof value
		if (type === 'string') {
			writeInlineString(value)
		} else {
			writeAsDefault(value)
		}
	}

	// writing any value in number serialization type mode
	function writeAsNumber(number) {
		var type = typeof number
		if (type === 'number') {
			if (number >>> 0 === number || (number > 0 && number < 0x400000000000 && number % 1 === 0)) {
				// 46 bit unsigned integer
				writeToken(NUMBER_CODE, number)
			} else {
				// decimal number serialized as a string
				var asString = number.toString()
				writeInlineString(asString)
			}
		} else if (type === 'boolean') {
			writeToken(TYPE_CODE, number ? TRUE : FALSE)
		} else if (type === 'object' && number && number.constructor === Array) {
			writeArray(number)
		} else {
			writeTypedValue(number)
		}
	}

	function writeTypedValue(value) {
		if (value === null)
			writeToken(TYPE_CODE, NULL)
		else if (value === false)
			writeToken(TYPE_CODE, FALSE)
		else if (value === true)
			writeToken(TYPE_CODE, TRUE)
		else if (value === undefined)
			writeToken(TYPE_CODE, UNDEFINED)
		else {
			writeTypedNonConstant(value)
		}
	}

	function writeTypedNonConstant(value) {
		var type = typeof value
		var extendedType
		if (type === 'object') {
			if (value) {
				var constructor = value.constructor
				if (constructor === Object) {
					// leave type as is
				} else if (constructor === Array) {
					type = 'array'
				} else {
					extendedType = extendedTypes.get(constructor)
					if (extendedType && extendedType.toValue) {
						value = extendedType.toValue(value)
						type = typeof value // go through the same logic adjustment here
						if (value && type === 'object' && value.constructor === Array) {
							type = 'array'
						}
						if (property.type === type) {
							// if we are the right type after doing the conversion, go back to the original property to serialize
							if (property.extendedType !== extendedType) {
								property.extendedType = extendedType
								writeToken(TYPE_CODE, METADATA_TYPE)
								writeInlineString(extendedType.name)
							}
							return writers[property.code](value)
						}
					} else {
						extendedType = false
					}

				}
			} else { // null
				type = 'undefined' // treat null as same type as undefined, both constants
			}
		} else if (type === 'boolean') {
			type = 'undefined'
		} else if (type === 'function') {
			value = value.toString()
			type = 'string'
		}
		property = writeProperty(value, null, type, extendedType)
		writers[property.code](value)
	}

	function writeOnlyNull() {
		writeToken(TYPE_CODE, NULL)
	}

	// writing any value in default serialization type mode
	function writeAsDefault(value, parentProperty) {
		var type = typeof value
		if (type === 'object') {
			if (!value) {
				return writeToken(TYPE_CODE, NULL)
			}
			// else continue with the object code
		} else if (type === 'string') {
			return writeInlineString(value)
		} else if (type === 'number' && (value >>> 0 === value || (value > 0 && value < 0x400000000000 && value % 1 === 0))) {
			// 46 bit unsigned integer
			return writeToken(NUMBER_CODE, value)
		} else {
			return writeTypedValue(value)
		}
		var object = value
		var constructor = object.constructor
		var notPlainObject
		if (object[targetSymbol]) {
			return writeBlockReference(value)
		} else if (constructor === Object) {
			notPlainObject = false
		} else if (constructor === Array) {
			property = writeProperty(value, null, 'array')
			return writers[property.code](value, parentProperty)
		} else {
			if (object.then) {
				return writeBlockReference(value)
			}
			extendedType = extendedTypes.get(constructor)
			if (extendedType) {
				if (extendedType.toValue) {
					return writeTypedValue(object)
				}
			} else {
				extendedTypes.set(constructor, extendedType = {
					name: constructor.name
				})
			}
			if (property.constructs !== constructor) {
				writeToken(TYPE_CODE, METADATA_TYPE)
				writeInlineString(extendedType.name)
				property.constructs = constructor
			}
			if (typeof Symbol !== 'undefined' && object[Symbol.iterator]) {
				writeProperty(value, null, 'array')
				writeAsIterable(object)
			}
			notPlainObject = true
		}
		var thisProperty = property
		startSequence()
		var i = 0
		var sparse = false // densely packed property references can be searched more quickly
		var propertyIndex = 0
		for (var key in object) {
			if (notPlainObject && !object.hasOwnProperty(key))
				continue
			var value = object[key]
			type = typeof value
			property = thisProperty[propertyIndex]
			var constructor
			var extendedType = false
			if (type === 'object') {
				if (value) {
					constructor = value.constructor
					if (constructor === Object) {
						// leave type as is
					} else if (constructor === Array) {
						type = 'array'
					} else {
						extendedType = extendedTypes.get(constructor)
						if (extendedType && extendedType.toValue) {
							value = extendedType.toValue(value)
							type = typeof value // go through the same logic adjustment here
							if (value && type === 'object' && value.constructor === Array) {
								type = 'array'
							}
						} else {
							extendedType = false
						}

					}
				} else { // null
					type = 'undefined' // treat null as same type as undefined, both constants
				}
			} else if (type === 'boolean') {
				type = 'undefined'
			}
			if (!property || property.key !== key ||
				(property.type !== type && type !== 'boolean' && type !== 'undefined' && value !== null) ||
				(extendedType && property.extendedType !== constructor)) {
				var lastPropertyIndex = propertyIndex
				// property doesn't match, search for it through existing properties
				// note that we are starting at the current propertyIndex, so this makes the assumption that
				// properties are rarely ever swapped, so possible property slots are always forward
				if (sparse) // once we are in sparse mode, need to start at the beginning each time
					propertyIndex = -1
				do {
					property = thisProperty[++propertyIndex]
				} while(property && (property.key !== key ||
						(property.type !== type && type !== 'boolean' && type !== 'undefined' && value !== null) ||
						(extendedType && property.extendedType !== constructor)))
				if (property) {
					// found a match, reference it
					writeToken(PROPERTY_CODE, propertyIndex)
					sparse = true
				} else if (thisProperty.getProperty) {
					// a shared property, let it allocate ids
					property = thisProperty.getProperty(value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex)
					propertyIndex = property.index
					if (lastPropertyIndex !== propertyIndex) {
						sparse = true
					}	
				} else {
					if (lastPropertyIndex === thisProperty.length) {
						propertyIndex = lastPropertyIndex
					} else {
						writeToken(PROPERTY_CODE, propertyIndex = thisProperty.length)
						sparse = true
					}
					property = thisProperty[propertyIndex] = writeProperty(value, key, type, extendedType, propertyIndex)
				}
			}
			writers[property.code](value)
			propertyIndex++
			i++
		}
		property = thisProperty
		endSequence(i)
	}

	function writeProperty(value, key, type, extendedType, index) {
		var property
		property = []
		property.type = type
		property.key = key
		if (type === 'string') {
			writeToken(TYPE_CODE, REFERENCING_TYPE)
			property.values = []
			property.code = REFERENCING_TYPE
		} else if (type === 'number') {
			writeToken(TYPE_CODE, NUMBER_TYPE)
			property.code = NUMBER_TYPE
		} else if (type === 'object') {
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.code = DEFAULT_TYPE
		} else if (type === 'array') {
			writeToken(TYPE_CODE, ARRAY_TYPE)
			property.code = ARRAY_TYPE
		} else if (type === 'boolean' || type === 'undefined') {
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.code = DEFAULT_TYPE
		} else {
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.code = 10
			console.error('Unable to write value of type ' + type)
		}

		if (typeof key === 'string') {
			writeInlineString(key)
		} else {
			writeAsDefault(key)
		}
		if (extendedType) {
			property.extendedType = extendedType
			writeToken(TYPE_CODE, METADATA_TYPE)
			writeInlineString(extendedType.name)
		}
		return property
	}

	function writeAsBlock(value) {
		// once we enter the block property, we must exit to serialize any other type, or we mess up the reference numbers
		if (value && (value.constructor === serialize.Block || value.then)) {
			return writeBlockReference(value)
		}
		return writeTypedValue(value)
	}

	function writeAsIterable(iterable) {
		writeToken(SEQUENCE_CODE, 15)
		var iterator = iterable[Symbol.iterator]()
		var arrayProperty = property
		property = arrayProperty.child || (arrayProperty.child = arrayProperty) // set the current property to the child property
		// write out the elements
		var result
		while(!(result = iterator.next()).done) {
			writers[property.code](result.value, arrayProperty)
		}
		if (property !== arrayProperty.child) {
			// TODO: This really needs to happen immediately when a property changes, to match the parsing behavior
			arrayProperty.child = property
		}
		property = arrayProperty // restore current property
		writeToken(TYPE_CODE, END_SEQUENCE) // end sequence
	}

	function writeAsArray(array, parentProperty) {
		if (!array) {
			writeTypedValue(array)
		} else if (array[targetSymbol]) {
			return writeBlockReference(array)
		} else if (array.constructor === Array) { // check to make sure it is an array
			var length = array.length
			var needsClosing
			if (length > 14) {
				writeToken(SEQUENCE_CODE, 15) // start sequence ?
				needsClosing = true
			} else {
				writeToken(SEQUENCE_CODE, length) // write out the header token
			}
			var arrayProperty = property
			property = arrayProperty[0] // set the current property to the child property
			// write out the elements
			for (var i = 0; i < length; i++) {
				var value = array[i]
				var type = typeof value
				if (type === 'object') {
					if (value) {
						var constructor = value.constructor
						if (constructor === Object) {
							// leave type as is
						} else if (constructor === Array) {
							type = 'array'
						} else {
							var extendedType = extendedTypes.get(constructor)
							if (extendedType && extendedType.toValue) {
								value = extendedType.toValue(value)
								type = typeof value // go through the same logic adjustment here
								if (value && type === 'object' && value.constructor === Array) {
									type = 'array'
								}
							} else {
								extendedType = false
							}

						}
					} else { // null
						type = 'undefined' // treat null as same type as undefined, both constants
					}
				} else if (type === 'boolean') {
					type = 'undefined'
				}
				if (!property) {
					if (arrayProperty.getProperty) {
						// a shared property
						property = arrayProperty.getProperty(value, null, type, extendedType, writeProperty, writeToken, 0)
					} else if (type === 'string' || type === 'number')
						property = writeProperty(value, null, type, extendedType, 0)
					else {
						// default doesn't have to be written
						property = []
						property.type = type
						property.key = null
						property.code = DEFAULT_TYPE
					}
					arrayProperty[0] = property
				} else if ((property.type !== type && type !== 'boolean' && type !== 'undefined' && value !== null) ||
					(extendedType && property.extendedType !== constructor)) {
					if (arrayProperty.getProperty) {
						// a shared property
						property = arrayProperty.getProperty(value, null, type, extendedType, writeProperty, writeToken, 0)
					} else {
						property = writeProperty(value, null, type, extendedType, 0)
					}
					arrayProperty[0] = property
				}
				writers[property.code](value)
			}
			if (needsClosing) {
				writeToken(TYPE_CODE, END_SEQUENCE) // end sequence
			}
			property = arrayProperty // restore current property
		} else { // bail to default mode behavior
			writeTypedValue(array)
		}
	}



	function writeBlock(value) {
		var parentProperties = properties
		var parentProperty = property
		var parentBlockProperty = blockProperty

		var parentPropertyIndex = nextPropertyIndex
		var parentNextBlockId = nextBlockId
		var parentRootProperty = rootProperty
		nextPropertyIndex = 8
		properties = new Map()
		rootProperty = property = { index: 0 } // new root property
		blockProperty = null
		nextBlockId = 0
		writeToken(SEQUENCE_CODE, BLOCK_SUB_CODE)
		writeBuffer(serialize(value))
		properties = parentProperties
		nextPropertyIndex = parentPropertyIndex
		property = parentProperty
		rootProperty = parentRootProperty
		nextBlockId = parentNextBlockId
		blockProperty = parentBlockProperty
	}

	function getRelativeReference(id) {
		var relativeIndex = id - property.index
		return relativeIndex >= 0 ? (relativeIndex << 1) + 8 : ((-relativeIndex << 1) + 7)
	}

	function writePromise(promise) { // in object mode
		var id = nextBlockId++
		if (id === 0 && options.outlet) {
			writeToken(PROPERTY_CODE, 7)
			writeToken(PROPERTY_CODE, REFERENCING_TYPE)
			writeToken(NUMBER_CODE, UNDEFINED)
			writeToken(NUMBER_CODE, UNDEFINED)
		}
		writeToken(PROPERTY_CODE, 7)
		writeToken(NUMBER_CODE, id + 4) // should be in object mode
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

					var startOffset = charEncoder.getOffset()
					var buffer = value && value[bufferSymbol]
					if (id === 1 && !options.outlet) {
						writeToken(PROPERTY_CODE, 7)
						writeToken(PROPERTY_CODE, REFERENCING_TYPE)
						writeToken(NUMBER_CODE, UNDEFINED)
						writeToken(NUMBER_CODE, UNDEFINED)
					}
					writeToken(PROPERTY_CODE, 7)
					if (buffer) { // block array
						writeToken(SEQUENCE_CODE, buffer.length + 16) // indicate it is a block
						writeBuffer(buffer)
					} else {
						writeBlock(value) // write it as a block
					}
				}, function(error) {
					writeToken(SEQUENCE_CODE, id)
					writeBlock({ error: error.message }) // write it as a block
				}).then(callback)
			}
		}
		pendingEncodings.push(lazyPromise)
	}

	var blockProperty


	function writeBlockReference(block, writer) {
		writeToken(TYPE_CODE, DEFERRED_REFERENCE)
		var blockProperty = property
		var lazyPromise = block[targetSymbol] ? {
			then: then
		} : {
			then: function(callback) {
				return block.then(function(value) {
					block = value
					then(callback)
				})
			}
		}
		function then(callback) {
			if (options.forBlock) {
				// this is used by the sizeTable serializer to record the size of each block
				options.forBlock(block)
			} else {
				var buffer = block[bufferSymbol]
				if (buffer) {
					writeBuffer(buffer)
				} else {
					property = blockProperty
					var lastPendingEncodings = pendingEncodings
					pendingEncodings = [] // record any nested pending encoding separately
					writeAsDefault(block) // write it out as the next block
					lastPendingEncodings.unshift.apply(lastPendingEncodings, pendingEncodings) // and splice them in front
					pendingEncodings = lastPendingEncodings
				}
			}
			callback()
		}
		pendingEncodings.push(lazyPromise)
	}

	var serializer = {
		serialize: function(value, sharedProperty) {
			var buffer = value && value[bufferSymbol]
			if (buffer) {
				charEncoder.writeBuffer(buffer)
				return
			}
			if (sharedProperty) {
				property = sharedProperty
				writeAsDefault(value)
				sharedProperty.reset()
			} else {
				property = []
				writeAsDefault(value)
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
		flush: charEncoder.flush,
		setOffset: charEncoder.setOffset,
		pendingEncodings: pendingEncodings,
		getWriters: function() {
			return {
				writeProperty: writeProperty,
				writeToken: writeToken,
				writeAsDefault: writeAsDefault
			}
		}
	}
	return serializer
}
function serialize(value, options) {
	var serializer = createSerializer(options)
	serializer.serialize(value, options && options.shared)
	var buffer = serializer.getSerialized()
	var sizeTable = value && value[sizeTableSymbol]
	if (sizeTable) {
		buffer.sizeTable = sizeTable
	}

	if (options && options.lazy) {
		return Buffer.concat([value[sizeTableSymbol], buffer])
	}
	return buffer
}
exports.serialize = serialize
exports.createSerializer = createSerializer
function browserCharEncoder() {
	var serialized = ''
	function writeToken(type, number) {
		var serializedToken
		if (number < 0x10) { // 4 bits of number
			serializedToken = String.fromCharCode(((type << 4) | number) ^ 0x40)
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
		startSequence: function() {
			writeToken(SEQUENCE_CODE, 15)
		},
		endSequence: function() {
			writeToken(TYPE_CODE, END_SEQUENCE)
		},
		getOffset: function() {// unsupported
			return -1
		}
	}
}
var ArrayFrom = Array.from || function(iterable, keyValue) {
	var array = []
	var keyValue = iterable.constructor === Map
	iterable.forEach(function(key, value) {
		if (keyValue) {
			array.push([value, key])
		} else {
			array.push(key)
		}
	})
	return array
}

function writeMap(map) {
	var keyValues = ArrayFrom(map)
	for (var i = 0, length = keyValues.length; i < length; i++) {
		var keyValue = keyValues[i]
		keyValues[i] = {
			key: keyValue[0],
			value: keyValue[1]
		}
	}
	return keyValues
}
function writeSet(set) {
	return ArrayFrom(set)
}
function writeDate(date) {
	return date.getTime()
}



var bufferSymbol = require('./Block').bufferSymbol
var headerSymbol = require('./Block').headerSymbol
var targetSymbol = require('./Block').targetSymbol
var parsedSymbol = require('./Block').parsedSymbol
var sizeTableSymbol = require('./Block').sizeTableSymbol
