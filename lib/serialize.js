"use strict"
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
var COPY_PROPERTY = 12  // for defining a typed object without returning the value
var REFERENCING_POSITION = 13
var TYPE_DEFINITION = 14  // for defining a typed object without returning the value

var ERROR_METADATA = 500

// sequence codes
var OPEN_SEQUENCE = 12 // <
var PARTIAL_DEFERRED_REFERENCE = 12 // <
var END_SEQUENCE = 14 // >
var DEFERRED_REFERENCE = 15 // ?
var nextId = 1
var iteratorSymbol = typeof Symbol !== 'undefined' ? Symbol.iterator : '__iterator_symbol__'

function createSerializer(options) {
	if (!options)
		options = {}
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
	var avoidShareUpdate = options.outlet || options.avoidShareUpdate
	var charEncoder = (typeof global != 'undefined' && global.Buffer && !(options && options.encoding === 'utf16le')) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
	var writeString = charEncoder.writeString
	var writeToken = charEncoder.writeToken
	var startSequence = charEncoder.startSequence
	var endSequence = charEncoder.endSequence
	var writeBuffer = charEncoder.writeBuffer
	var forProperty = options.forProperty
	var propertyUsed
	var valueUsed
	if (options.shared) {
		propertyUsed = options.shared.propertyUsed
		valueUsed = options.shared.propertyUsed
	}
	var pendingEncodings = []
	var nextPropertyIndex = 8
	var property
	var bufferSymbol = exports.bufferSymbol || '_bufferSymbol_'
	var targetSymbol = exports.targetSymbol || '_targetSymbol_'
	var propertyComparisons = 0
	var serializerId = nextId++

	var writers = [
		0, 1, 2, 3, 4 , 5,
		writeAsDefault,
		writeAsArray,
		writeAsReferencing,
		writeAsNumber,
		writeOnlyNull
	]
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
		var type, values = property.values
		if (values) {
			if (values.resetTo > -1 && values.serializer !== serializerId) {
				// if this is a shared values, need to reset on each serialization
				values.serializer = serializerId
				if (values.resetTo < values.length)
					values.length = values.resetTo
				writeToken(TYPE_CODE, REFERENCING_POSITION)
				writeToken(NUMBER_CODE, values.resetTo)
			}
			var reference = values.indexOf(value)
			if (reference > -1) {
				return writeNumber(reference)
			}
		}
		if ((type = typeof value) === 'string' || type ==='object' && value) {
			if (property.writeSharedValue) {
				if (property.writeSharedValue(value, writeToken, serializerId))
					return
			} else if (values) {
				var index = values.length
				if (index < 12)
					values[index] = value
			}
		}
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
		} else if (type === 'object') {
			writeAsDefault(number)
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
		property = writeProperty(null, type, extendedType)
		writers[property.code](value)
	}

	function writeOnlyNull() {
		writeToken(TYPE_CODE, NULL)
	}

	// writing any value in default serialization type mode
	function writeAsDefault(value, isRoot) {
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
			property = writeProperty(property.key, 'array')
			return writers[property.code](value)
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
				if (object[iteratorSymbol]) {
					property = writeProperty(property.key, 'array')
					return writeAsIterable(object, isRoot)
				}
				extendedTypes.set(constructor, extendedType = {
					name: constructor.name
				})
			}
			if (property.constructs !== constructor) {
				writeToken(TYPE_CODE, METADATA_TYPE)
				writeInlineString(extendedType.name)
				property.constructs = constructor
			}
			notPlainObject = true
		}
		var thisProperty = property
		if (thisProperty.resetTo < thisProperty.length && thisProperty.serializer != serializerId) {
			thisProperty.length = thisProperty.resetTo
			thisProperty.serializer = serializerId
		}
		startSequence()
		var i = 0
		//var sparse = false // densely packed property references can be searched more quickly
		var resumeIndex = -2 // -2 denotes densely packed property references 
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
						} else if (value[iteratorSymbol] && !value.then) {
							type = 'array'
						} else {
							extendedType = false
						}
					}
				} else { // null
					type = 'undefined' // treat null as same type as undefined (and boolean), both constants that can go in any type
				}
			}
			if (!property || property.key !== key ||
				(property.type !== type && type !== 'boolean' && type !== 'undefined' && !(type === 'string' && property.type !== 'number')) ||
				(extendedType && property.extendedType !== constructor)) {
				var lastPropertyIndex = propertyIndex
				// property doesn't match, search for it through existing properties
				// note that we are starting at the current propertyIndex, so this makes the assumption that
				// properties are rarely ever swapped, so possible property slots are always forward
				if (resumeIndex > -2)
					propertyIndex = resumeIndex
				do {
					property = thisProperty[++propertyIndex]
				} while(property && (property.key !== key ||
						(property.type !== type && type !== 'boolean' && type !== 'undefined' && !(type === 'string' && property.type !== 'number')) ||
						(extendedType && property.extendedType !== constructor)))
				if (property) {
					// found a match, reference it
					writeToken(PROPERTY_CODE, propertyIndex)
					if (resumeIndex === -2) {
						resumeIndex = lastPropertyIndex - 1
					}
				} else if (thisProperty.getProperty) {
					// a shared property, let it allocate ids
					property = thisProperty.getProperty(value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex)
					propertyIndex = property.index
					if (lastPropertyIndex !== propertyIndex && resumeIndex === -2) {
						resumeIndex = lastPropertyIndex - 1
					}
				} else {
					if (lastPropertyIndex === thisProperty.length) {
						propertyIndex = lastPropertyIndex
					} else {
						writeToken(PROPERTY_CODE, propertyIndex = thisProperty.length)
						if (resumeIndex === -2) {
							resumeIndex = lastPropertyIndex - 1
						}
					}
					if (propertyIndex < thisProperty.resetTo) {
						debugger
						throw new Error('overwriting frozen property')
					}

					property = thisProperty[propertyIndex] = writeProperty(key, type, extendedType)
				}
			}
			if (propertyUsed)
				propertyUsed(property, object, serializerId, i)
//			if (property.resumeIndex) // TODO: add a flag to enable this when property ordering can be assumed
//				resumeIndex = property.resumeIndex
			var code = property.code
			if (code > 7) {
				if (code === 8)
					writeAsReferencing(value)
				else
					writeAsNumber(value)
			} else {
				if (code === 6) 
					writeAsDefault(value)
				else
					writeAsArray(value)
			}
			propertyIndex++
			i++
		}
		property = thisProperty
		endSequence(i)
	}

	function writeProperty(key, type, extendedType) {
		var property
		property = []
		property.key = key
		property.type = type
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
			property.type = 'object'
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.code = DEFAULT_TYPE
		} else {
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.code = 10
			console.error('Unable to write value of type ' + type)
		}

		if (typeof key === 'string') {
			writeInlineString(key)
		} else if (!(key === null && (type === 'object' || type === 'array'))) { // if key is null followed by sequence, we can elide the key
			writeAsDefault(key)
		}
		if (extendedType) {
			property.extendedType = extendedType
			writeToken(TYPE_CODE, METADATA_TYPE)
			writeInlineString(extendedType.name)
		}
		return property
	}

	function writeAsIterable(iterable, isRoot, iterator) {
		// TODO: With top level iterables we could pause for back-pressure
		try {
			if (!iterator) {
				writeToken(SEQUENCE_CODE, OPEN_SEQUENCE)
				iterator = iterable[iteratorSymbol]()
			}
			var arrayProperty = property
			property = arrayProperty.child || (arrayProperty.child = arrayProperty) // set the current property to the child property
			// write out the elements
			var result
			while(!(result = iterator.next()).done) {
				writers[property.code](result.value, arrayProperty)
				if (isRoot && charEncoder.hasWritten) {
					charEncoder.hasWritten = false // reset this property
					property = arrayProperty // restore current property
					pendingEncodings.unshift({
						then: function(callback) {
							writeAsIterable(null, true, iterator)
							return callback()
						}
					})
					return
				}
			}
		} catch(error) {
			writeToken(TYPE_CODE, METADATA_TYPE)
			writeToken(NUMBER_CODE, ERROR_METADATA)
			writeAsDefault(Object.assign(new ((typeof error == 'object' && error) ? error.constructor : Error)(), {
				name: error && error.name, // make these enumerable so they will serialize
				message: error && error.message || error
			}))
		}
		if (property !== arrayProperty.child) {
			// TODO: This really needs to happen immediately when a property changes, to match the parsing behavior
			arrayProperty.child = property
		}
		property = arrayProperty // restore current property
		writeToken(SEQUENCE_CODE, END_SEQUENCE) // end sequence
	}

	function writeAsArray(array) {
		if (!array) {
			writeTypedValue(array)
		} else if (array[targetSymbol]) {
			return writeBlockReference(array)
		} else if (array.constructor === Array) { // check to make sure it is an array
			var length = array.length
			var needsClosing
			if (length > 11) {
				writeToken(SEQUENCE_CODE, OPEN_SEQUENCE) // start sequence <
				needsClosing = true
			} else {
				writeToken(SEQUENCE_CODE, length) // write out the header token
			}
			var arrayProperty = property
			property = arrayProperty[0] // set the current property to the child property
			// check to see if needs to be reset before starting
			if (arrayProperty.resetTo < arrayProperty.length && arrayProperty.serializer != serializerId) {
				arrayProperty.length = arrayProperty.resetTo
				arrayProperty.serializer = serializerId
			}
			var propertyIndex = 0
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
				}
				if (!property) {
					if (arrayProperty.getProperty) {
						// a shared property
						property = arrayProperty.getProperty(value, null, type, extendedType, writeProperty, writeToken, 0)
					} else {
						if (type === 'string' || type === 'number' || type === 'array')
							property = writeProperty(null, type, extendedType)
						else {
							// default doesn't have to be written
							property = []
							property.type = type
							property.key = null
							property.code = DEFAULT_TYPE
						}
						arrayProperty[0] = property
					}
				} else if ((property.type !== type && type !== 'boolean' && type !== 'undefined' && !(type === 'string' && property.type !== 'number')) ||
					(extendedType && property.extendedType !== constructor)) {
					propertyIndex = -1
					do {
						property = arrayProperty[++propertyIndex]
					} while(property && ((property.type !== type && type !== 'boolean' && type !== 'undefined' && !(type === 'string' && property.type !== 'number')) ||
							(extendedType && property.extendedType !== constructor)))
					if (property) {
						writeToken(PROPERTY_CODE, propertyIndex)
					} else if (arrayProperty.getProperty) {
						// a shared property
						property = arrayProperty.getProperty(value, null, type, extendedType, writeProperty, writeToken, -1)
					} else {
						writeToken(PROPERTY_CODE, propertyIndex)
						property = writeProperty(null, type, extendedType)
						arrayProperty[propertyIndex] = property
					}
				}
				if (propertyUsed)
					propertyUsed(property, array, serializerId, i)
				var code = property.code
				if (code > 7) {
					if (code === 8)
						writeAsReferencing(value)
					else
						writeAsNumber(value)
				} else {
					if (code === 6) 
						writeAsDefault(value)
					else
						writeAsArray(value)
				}
			}
			if (needsClosing) {
				writeToken(SEQUENCE_CODE, END_SEQUENCE) // end sequence
			}
			property = arrayProperty // restore current property
		} else if (array[iteratorSymbol]) {
			return writeAsIterable(array)
		} else { // bail to default mode behavior
			writeTypedValue(array)
		}
	}

	var blockProperty

	function writeBlockReference(block, writer) {
		writeToken(SEQUENCE_CODE, DEFERRED_REFERENCE)
		var blockProperty = property
		var lazyPromise = block[targetSymbol] ? {
			then: then
		} : {
			then: function(callback) {
				return block.then(function(value) {
					block = value
					then(callback)
				}, function(error) {
					block = Object.assign(new ((typeof error == 'object' && error) ? error.constructor : Error)(), {
						name: error && error.name, // make these enumerable so they will serialize
						message: error && error.message || error
					})
					if (!blockProperty.upgrade) {
						writeToken(TYPE_CODE, METADATA_TYPE)
						writeToken(NUMBER_CODE, ERROR_METADATA)
					}
					then(callback)
				})
			}
		}
		function then(callback) {
			if (options.forBlock && block) {
				// this is used by the sizeTable serializer to record the size of each block
				options.forBlock(block, blockProperty)
			} else {
				var buffer = block && block[bufferSymbol] && block[bufferSymbol](blockProperty)
				if (buffer) {
					writeBuffer(buffer)
				} else {
					property = blockProperty
					var lastPendingEncodings = pendingEncodings
					pendingEncodings = [] // record any nested pending encoding separately
					writeAsDefault(block, true) // write it out as the next block
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
			var buffer = value && value[bufferSymbol] && value[bufferSymbol](sharedProperty)

			if (buffer) {
				charEncoder.writeBuffer(buffer)
				return
			}
			if (sharedProperty) {
				property = sharedProperty
				writers[property.code](value)
			} else {
				property = []
				property.key = null
				writeAsDefault(value, true)
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
			if (options && options.encoding === 'utf16le') {
				return Buffer.from(charEncoder.getSerialized(), 'utf16le')
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
				writeAsDefault: writeAsDefault,
				writeBuffer: writeBuffer
			}
		}
	}
	return serializer
}
function serialize(value, options) {
	var serializer = createSerializer(options)
	var sharedProperty = options && options.shared
	var buffer
	if (sharedProperty && sharedProperty.startWrite) {
		// record the start of each write
		sharedProperty.startWrite(options.avoidShareUpdate, value)
	}
	serializer.serialize(value, sharedProperty)
	buffer = serializer.getSerialized()
	if (sharedProperty && sharedProperty.endWrite) {
		// record the end of each write
		sharedProperty.endWrite(options.avoidShareUpdate, value)
	}
	var sizeTable = value && value[exports.sizeTableSymbol]
	if (sizeTable) {
		buffer.sizeTable = sizeTable
	}

	if (options && options.lazy) {
		return Buffer.concat([value[exports.sizeTableSymbol], buffer])
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
			writeToken(SEQUENCE_CODE, OPEN_SEQUENCE)
		},
		endSequence: function() {
			writeToken(SEQUENCE_CODE, END_SEQUENCE)
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