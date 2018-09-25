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
const BLOCK_TYPE = 5
const METADATA_TYPE = 6
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
	var pendingEncodings = []
	var properties = new Map()
	var evictedProperties = []
	var currentProperty
	var nextStringIndex = 256
	var lastReference = 0
	var nextBlockId = 0
	var structures = new Map()
	var nextPropertyIndex = 1
	var strings = new Map()
	var nextStringId = 16
	var structureIndex = 16
	var property = { index: 0 } // default root property
	// stores last used structure by *length* of array using that structure
	var recentStructures = []
	var lastReferencedProperties = new Array(16)
	if (options.useImport) {
		//options.useImport
	}

	// write a rudimentary array
	function writeArray(array, writer) {
		var length = array.length
		if (length > 10) {
			writeToken(SEQUENCE_CODE, 11) // start sequence [
		} else {
			writeToken(SEQUENCE_CODE, length) // write out the header token
		}
		for (var i = 0; i < length; i++) {
			writer(array[i])
		}
		if (length > 10) {
			writeToken(SEQUENCE_CODE, 13) // end sequence
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
			if (strings) {
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
			} else {
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
	function writeAsDefault(value, asRoot) {
		var type = typeof value
		if (type === 'string') {
			writeInlineString(value)
		} else if (type === 'number' && (value >>> 0 === value || (value > 0 && value < 0x400000000000 && value % 1 === 0))) {
			// 46 bit unsigned integer
			writeToken(NUMBER_CODE, value + 4)
		} else if (type === 'object') {
			writeAsObject(value, asRoot)
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
					var first = value[0]
					type = typeof first
					if (type !== 'string' && type !== 'number') { // string and number can hendle arrays of themselves
						type = 'array'
					}
				} else {
					extendedType = extendedTypes.get(constructor)
					if (extendedType && extendedType.toValue) {
						value = extendedType.toValue(value)
						type = typeof value // go through the same logic adjustment here
						if (value && type === 'object' && value.constructor === Array) {
							var first = value[0]
							if (type !== 'string' && type !== 'number') { // string and number can hendle arrays of themselves
								type = 'array'
							}
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
		}
		writeProperty(value, null, type, extendedType).writeValue(value)

	}

	// writing any value in object rudimentary type mode
	function writeAsObject(object, asRoot) {
		if (!object || typeof object !== 'object') {
			return writeTypedValue(object)
		}
		var constructor = object.constructor
		var notPlainObject
		if (constructor === Object) {
			notPlainObject = false
		} else if (constructor === Array) {
			return writeTypedValue(object)
		} else {
			if (object.then) {
				return writePromise(object)
			}
			if (constructor === serialize.Block) {
				return writeBlockReference(object)
			}
			extendedType = extendedTypes.get(constructor)
			if (extendedType) {
				if (extendedType.toValue) {
					return writeTypedValue(object)
				}
			} else {
				extendedTypes.set(constructor, {
					name: constructor.name
				})
			}
			if (property.constructs !== constructor) {
				writeToken(PROPERTY_CODE, METADATA_TYPE)
				writeInlineString(extendedType.name)
				property.constructs = constructor
			}
			notPlainObject = true
		}
		var values = []
		var thisProperty = property
		property = thisProperty.first
		startSequence()
		var i = 0
		for (var key in object) {
			if (notPlainObject && !object.hasOwnProperty(key))
				continue
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
						if (extendedType && extendedType.toValue) {
							value = extendedType.toValue(value)
							type = typeof value // go through the same logic adjustment here
							if (value && type === 'object' && value.constructor === Array) {
								var first = value[0]
								if (type !== 'string' && type !== 'number') { // string and number can hendle arrays of themselves
									type = 'array'
								}
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
				property = properties.get(key)
				if (property) {
					if (property.type === type && (!extendedType || property.extendedType === constructor)) { // right type, we can just reference the property
						var relativeIndex = property.index - (previousProperty ? previousProperty.index : thisProperty.index)
						writeToken(PROPERTY_CODE, relativeIndex > 0 ? (relativeIndex << 1) + 8 : ((-relativeIndex << 1) + 7))
					} else if (property[type]) {
						property = property[type]
						var relativeIndex = property.index - (previousProperty ? previousProperty.index : thisProperty.index)
						writeToken(PROPERTY_CODE, relativeIndex > 0 ? (relativeIndex << 1) + 8 : ((-relativeIndex << 1) + 7))
					} else {
						property = property[type] = writeProperty(value, key, type, extendedType)
					}
				} else {
					property = writeProperty(value, key, type, extendedType)
					properties.set(key, property)
				}
				if (previousProperty)
					previousProperty.next = property
				else
					thisProperty.first = property
				/*if (needsStateRecorded) {
					if (property.currentBlock !== currentBlock) {
						structuresToRestore.push(property, structure.slice(0))
						property.currentBlock = currentBlock
						needsStateRecorded = false
					}
				}*/
				// once it is written, update our entries
			}
			property.writeValue(value)
			var previousProperty = property
			property = property.next
			i++
		}
		property = thisProperty
		if (asRoot && pendingEncodings.length > 0) {
			serializer.rootBuffer = Buffer.from([]) // indicate that we need to finish with an end sequence token
		} else {
			endSequence(i)
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
			property.writeValue = writeAsObject
		} else if (type === 'array') {
			writeToken(PROPERTY_CODE, ARRAY_OF_OBJECT_TYPE)
			property.elements = {
				type: 'object',
				index: property.index,
			}
			property.writeValue = writeAsArray
		} else if (typeof value === 'boolean') {
			writeToken(PROPERTY_CODE, NUMBER_TYPE)
			property.writeValue = writeAsNumber
		} else {
			writeToken(PROPERTY_CODE, DEFAULT_TYPE)
			property.writeValue = writeAsDefault
		}

		if (typeof key === 'string') {
			writeInlineString(key)
		} else {
			writeAsDefault(key)
		}
		if (extendedType) {
			property.extendedType = extendedType
			writeToken(PROPERTY_CODE, METADATA_TYPE)
			writeInlineString(extendedType.name)
		}
		return property
	}

	function writeAsArray(array) {
		if (array && array.constructor === Array) { // check to make sure it is an array
			var length = array.length
			var needsEnd
			if (length > 10) {
				writeToken(SEQUENCE_CODE, 11) // start sequence [
			} else {
				writeToken(SEQUENCE_CODE, length) // write out the header token
			}
			var arrayProperty = property
			var elementsProperty = arrayProperty.elements || (arrayProperty.elements = []) // set the current property to the elements property
			// write out the elements
			for (var i = 0; i < length; i++) {
				property = elementsProperty
				writeAsObject(array[i])
			}
			property = arrayProperty // restore current property
			if (length > 10) {
				writeToken(SEQUENCE_CODE, 13) // end sequence
			}
		} else { // bail to default mode behavior
			writeTypedValue(array)
		}
	}



	function writeBlock(value) {
		var parentProperties = properties
		var blockProperty = {
			index: nextPropertyIndex++
		}
		var parentPropertyIndex = nextPropertyIndex
		nextPropertyIndex = 1
		properties = new Map()
		property = { index: 0 } // new root property
		writeToken(PROPERTY_CODE, BLOCK_TYPE) // indicate it is a block
		writeAsDefault(null) // length unknown
		writeAsDefault(value)
		properties = parentProperties
		nextPropertyIndex = parentPropertyIndex
		property = blockProperty
	}


	var promisesToStart
	function writePromise(promise) { // in object mode
		var id = nextBlockId--
		var relativeIndex = id - property.index
		writeToken(NUMBER_CODE, (-relativeIndex << 1) + 7) // should be in object mode
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
					var buffer = value[bufferSymbol]
					if (id !== nextPropertyIndex) {
						var relativeIndex = id - property.index
						writeToken(PROPERTY_CODE, (-relativeIndex << 1) + 7) // identify the block
					}
					if (buffer) { // block array
						writeToken(PROPERTY_CODE, BLOCK_TYPE) // indicate it is a block
						property = {
							index: nextPropertyIndex++
						}
						writeAsDefault(buffer.length) // write length
						writeBuffer(buffer)
					} else {
						writeBlock(value) // write it as a block
					}
				}, function(error) {
					var relativeIndex = id - property.index
					writeToken(PROPERTY_CODE, (-relativeIndex << 1) + 7) // identify the block
					writeToken(PROPERTY_CODE, BLOCK_TYPE) // indicate it is a block
					property = {
						index: nextPropertyIndex++
					}
					writeAsDefault(null) // unknown length
					writeAsDefault({ error: error.message })
				}).then(callback)
			}
		}
		pendingEncodings.push(lazyPromise)
	}


	function writeBlockReference(block, writer) {
		var id = nextBlockId--
		var relativeIndex = id - property.index
		writeToken(NUMBER_CODE, (-relativeIndex << 1) + 7) // should be in object mode
		var lazyPromise = {
			then: function(callback) {
				var startOffset = charEncoder.getOffset()
				var buffer = block[bufferSymbol]
				if (id !== nextPropertyIndex) {
					var relativeIndex = id - property.index
					writeToken(PROPERTY_CODE, (-relativeIndex << 1) + 7) // identify the block
				}
				writeToken(PROPERTY_CODE, BLOCK_TYPE) // indicate it is a block
				property = {
					index: nextPropertyIndex++
				}
				if (buffer) { // block array
					writeAsDefault(buffer.length) // write length
					writeBuffer(buffer)
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
			if (options && options.asBlock) {
				startingOffset += 2
				writeBlock(value)
			} else {
				writeAsDefault(value, true)
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
					var isObject = value && value.constructor === Object
					this.rootBuffer = Buffer.from(rootBuffer.slice(startingOffset + (isObject ? 1 : 0))) // TODO: only if in object do we increment
					charEncoder.setOffset(startingOffset)
					writeToken(SEQUENCE_CODE, 11) // make sure it starts with an open sequence
					// this is a rather tricky technique, but as long as the assumption hold true, is an elegant way to handle inserting these references,
					// we are creating blocks for each pending encoding, and so we reset the next property index to before the start of the last block,
					// and let each block get its natural index
					nextPropertyIndex = 1 - pendingEncodings.length
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
		startSequence: function() {
			writeToken(SEQUENCE_CODE, 11)
		},
		endSequence: function() {
			writeToken(SEQUENCE_CODE, 13)
		},
		getOffset: function() {// unsupported
			return -1
		}
	}
}

function writeMap(map) {
	var keyValues = Array.from(map)
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
	return Array.from(set)
}
function writeDate(date) {
	return date.getTime()
}


var bufferSymbol = require('./Block').bufferSymbol
var headerSymbol = require('./Block').headerSymbol
var parsedSymbol = require('./Block').parsedSymbol
