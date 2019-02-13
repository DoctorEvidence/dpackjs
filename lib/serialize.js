"use strict"
// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var TYPE_CODE = 3
var STRING_CODE = 2
var NUMBER_CODE = 1
var SEQUENCE_CODE = 7

// constant codes
var NULL = 0
var UNDEFINED = 1
var TRUE = 2
var FALSE = 3

// these are the starting codes (structures also use this space) for complete types
var DEFAULT_TYPE = 4
var ARRAY_TYPE = 5
var REFERENCING_TYPE = 6
var NUMBER_TYPE = 7
var EXTENSIONS = 8
var METADATA_TYPE = 9
var CONTINUED_REFERENCING_TYPE = 6

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
	var nextBlockId = 0
	var nextPropertyIndex = 8
	var property = [] // default root property
	property.index = 0
	var rootProperty = property
	if (options.useImport) {
		//options.useImport
	}

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
			property.writeValue(array[i])
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
								writeToken(PROPERTY_CODE, METADATA_TYPE)
								writeInlineString(extendedType.name)
							}
							return property.writeValue(value)
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
		writeProperty(value, null, type, extendedType).writeValue(value)
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
		if (constructor === Object) {
			notPlainObject = false
		} else if (constructor === Array) {
			return writeProperty(value, null, 'array').writeValue(value, parentProperty)
		} else {
			if (object.then) {
				return writeProperty(value, null, 'block').writeValue(value)
			}
			if (constructor === serialize.Block) {
				return writeProperty(value, null, 'block').writeValue(value)
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
				writeToken(PROPERTY_CODE, METADATA_TYPE)
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
					} else if (constructor === serialize.Block) {
						type = 'block'
					} else if (value.then) {
						type = 'block'
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
				} else if (lastPropertyIndex === thisProperty.length) {
					property = thisProperty[propertyIndex = lastPropertyIndex] = writeProperty(value, key, type, extendedType)
				} else {
					propertyIndex = thisProperty.length
					property = thisProperty[propertyIndex] = writeProperty(value, key, type, extendedType, propertyIndex)
					sparse = true
				}
			}
			property.writeValue(value)
			propertyIndex++
			i++
		}
		if (parentProperty === rootProperty && pendingEncodings.length > 0) {
			// note that we don't change back to the object's property, as the pending encodings should use relative references relative to the last property
			property = previousProperty
			serializer.rootBuffer = Buffer.from([]) // indicate that we need to finish with an end sequence token
			serializer.startSequenceLength = 1
		} else {
			property = thisProperty
			endSequence(i)
		}
	}

	function writeProperty(value, key, type, extendedType, index) {
		var property
		if (type === 'block') {
			if (!blockProperty) {
				blockProperty = {
					index: 7,
					type: CONTINUED_REFERENCING_TYPE,
					writeValue: writeAsBlock,
					values: []
				}
			}
			writeToken(PROPERTY_CODE, 7)
			if (nextBlockId === 0 && options.outlet) {
				writeToken(PROPERTY_CODE, REFERENCING_TYPE)
			} else {
				writeToken(PROPERTY_CODE, CONTINUED_REFERENCING_TYPE)
			}
			property = blockProperty
			property.key = key
			property.writeValue = writeAsBlock
			if (typeof key === 'string') {
				writeInlineString(key)
			} else {
				writeAsDefault(key)
			}
			return property
		}
		property = []
		property.type = type,
		property.key = key
		if (index) {
			writeToken(PROPERTY_CODE, index)
			property.index = index
		}
		if (type === 'string') {
			writeToken(TYPE_CODE, REFERENCING_TYPE)
			property.values = []
			property.writeValue = writeAsReferencing
		} else if (type === 'number') {
			writeToken(TYPE_CODE, NUMBER_TYPE)
			property.writeValue = writeAsNumber
		} else if (type === 'object') {
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.writeValue = writeAsDefault
		} else if (type === 'array') {
			writeToken(TYPE_CODE, ARRAY_TYPE)
			property[0] = writeProperty(value[0], key, typeof value[0])
			property.writeValue = writeAsArray
			return property
		} else if (type === 'boolean' || type === 'undefined') {
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.writeValue = writeAsDefault
		} else {
			writeToken(TYPE_CODE, DEFAULT_TYPE)
			property.writeValue = writeOnlyNull
			console.error('Unable to write value of type ' + type)
		}

		if (typeof key === 'string') {
			writeInlineString(key)
		} else {
			writeAsDefault(key)
		}
		if (forProperty) {
			forProperty(property, charEncoder)
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
		writeToken(SEQUENCE_CODE, 11)
		var iterator = iterable[Symbol.iterator]()
		var arrayProperty = property
		property = arrayProperty.child || (arrayProperty.child = arrayProperty) // set the current property to the child property
		// write out the elements
		var result
		while(!(result = iterator.next()).done) {
			property.writeValue(result.value, arrayProperty)
		}
		if (property !== arrayProperty.child) {
			// TODO: This really needs to happen immediately when a property changes, to match the parsing behavior
			arrayProperty.child = property
		}
		property = arrayProperty // restore current property
		writeToken(SEQUENCE_CODE, 13) // end sequence
	}

	function writeAsArray(array, parentProperty) {
		if (array && array.constructor === Array) { // check to make sure it is an array
			var length = array.length
			var needsClosing
			if (length > 14 || parentProperty === rootProperty) {
				writeToken(SEQUENCE_CODE, 15) // start sequence ?
				needsClosing = true
			} else {
				writeToken(SEQUENCE_CODE, length) // write out the header token
			}
			var arrayProperty = property
			property = arrayProperty[0] // set the current property to the child property
			// write out the elements
			for (var i = 0; i < length; i++) {
				property.writeValue(array[i], arrayProperty)
			}
			if (needsClosing) {
				if (parentProperty === rootProperty && pendingEncodings.length > 0) {
					serializer.rootBuffer = Buffer.from([]) // indicate that we need to finish with an end sequence token
					serializer.startSequenceLength = 3
					return
				}
				else
					writeToken(TYPE_CODE, 13) // end sequence
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
		var id = nextBlockId++
		if (!blockProperty) {
			blockProperty = {
				index: 7,
				writeValue: writeAsBlock
			}
		}
		writeToken(NUMBER_CODE, id + 4) // should be in object mode
		var lazyPromise = block.constructor === serialize.Block ? {
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
			var startOffset = charEncoder.getOffset()
			var buffer = block[bufferSymbol]
			writeToken(PROPERTY_CODE, 7)
			if (id === 0) {
				if (options.outlet) {
					writeToken(PROPERTY_CODE, CONTINUED_REFERENCING_TYPE)
				} else {
					writeToken(PROPERTY_CODE, REFERENCING_TYPE)
				}
				writeToken(NUMBER_CODE, UNDEFINED)
			}
			if (buffer) { // block array
				writeToken(SEQUENCE_CODE, buffer.length + 16) // indicate it is a block with length
				writeBuffer(buffer)
			} else {
				writeBlock(block) // write it as a block
			}
			callback()
		}
		pendingEncodings.push(lazyPromise)
	}

	var serializer = {
		serialize: function(value) {
			var buffer = value && value[bufferSymbol]
			if (buffer) {
				charEncoder.writeBuffer(buffer)
				return
			}
			var startingOffset = charEncoder.getOffset()
			if (options && options.asBlock) {
				startingOffset += 1
				writeBlock(value)
			} else {
				writeAsDefault(value, rootProperty)
			}
			if (pendingEncodings.length > 0) {
				if (options.outlet) {
					// if we have an outlet, we write the main content first, and then do the remaining blocks
					// but that should already happen naturally
					this.rootBuffer = Buffer.from([]) // just include a rootBuffer to indicate that a sequence close token is needed
				} else {
					// if there are other blocks (and no outlet) the content is deferred to go at the end, so length-defined blocks can be read first and lazily parsed
					var endOfBlock = charEncoder.getOffset()
					var blockBufferLength = endOfBlock - startingOffset
					var rootBuffer = charEncoder.getSerialized()
					startingOffset += this.startSequenceLength || 1
					this.rootBuffer = Buffer.from(rootBuffer.slice(startingOffset)) // TODO: only if in object do we increment
					charEncoder.setOffset(startingOffset)
					// this is a rather tricky technique, but as long as the assumption hold true, is an elegant way to handle inserting these references,
					// we are creating blocks for each pending encoding, and so we reset the next property index to before the start of the last block,
					// and let each block get its natural index
				}
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
			if (this.rootBuffer) {
				charEncoder.writeBuffer(this.rootBuffer)
				this.rootBuffer = null
				writeToken(SEQUENCE_CODE, 13) // close sequence to end it
			}
			return charEncoder.getSerialized()
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
			writeToken(TYPE_CODE, 13)
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
var parsedSymbol = require('./Block').parsedSymbol
