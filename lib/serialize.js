"use strict"
function createSerializer(options) {
	if (!options)
		options = {}
	var maxReferenceableStringLength = options.maxReferenceableStringLength || 2400
	var converterByConstructor = options.converterByConstructor
	if (!converterByConstructor) {
		converterByConstructor = new Map()
	}
	converterByConstructor.set(Map, writeMap)
	converterByConstructor.set(Set, writeSet)
	converterByConstructor.set(Date, writeDate)
	var charEncoder = (typeof global != 'undefined' && global.Buffer) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
	var writeString = charEncoder.writeString
	var writeToken = charEncoder.writeToken
	var writeBuffer = charEncoder.writeBuffer
	var pendingEncodings = []
	var properties = new Map()
	var propertyIndex = 16
	var currentProperty
	var nextStringIndex = 0
	var lastReference = 0
	var nextId = 1
	var structures = new Map()
	var structureIndex = 16
	var lastReferencedStructures = new Array(16)
	var lastReferencedProperties = new Array(16)
	if (options.useImport) {
		//options.useImport
	}
	function writeInlineString(string) {
		writeToken(1, string.length)
		writeString(string)
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

	var objectTypes = {
		Array: writeArray,
		Buffer: writeInlineBuffer
	}
	var writerByType = {
		string: writeStringProperty,
		number: writeOpen,
		object: writeObject,
		Promise: writeObject,
		Block: writeBlock,
		Array: writeArray
	}
	writeObject.propertyCode = 1
	writeStringProperty.propertyCode = 2
	writeOpen.propertyCode = 3
	writeBlock.propertyCode = 1
	function writeObject(object) {
		if (!object)
			return writeToken(0, 0)
		var constructor = object.constructor
		var notPlainObject = constructor !== Object
		if (notPlainObject) {
			if (constructor === Array)
				return writeArray(object, writeObject)
			else if (constructor === serialize.Block)
				return writeBlock(object)
			else if (object.then)
				return writePromise(object)
		}

		var structure = []
		var structureIndices = []
		var structureToWrite = []
		var values = []
		var structureEntry
		var property
		for (var key in object) {
			if (notPlainObject && !object.hasOwnProperty(key)) { // skip inherited properties, but skip inheritance check for plain objects
				continue
			}
			if (typeof key !== 'string')
				key = key.toString()
			property = properties.get(key)
			var value = object[key]
			var type = typeof value
			var isExtended = false
			if (value) {
				if (type === 'object') {
					var constructor = value.constructor
					if (constructor === Object) {
					} else if (constructor === Array) {
						type = null // any type to start with
						for (var i = 0, l = value.length; i < l; i++) {
							var entry = value[i]
							if (entry !== null) {
								var entryType = typeof entry
								if (entryType === 'boolean' || entryType === 'undefined') {
									entryType = 'number' // we treat Number as the "open" type
								}
								if (entryType !== type) {
									if (!type) {
										type = entryType
									} else {
										type = 'number' // mixed type
										break
									}
								}
							}
						}
						if (!type) {
							type = 'object'
						}
					} else if (constructor === serialize.Block) {
					} else {
						var converter = converterByConstructor.get(constructor)
						if (converter) {
							value = converter(value)
							if (converter.asType) {
								type = converter.asType
							} else {
								type = 'number'
							}
							type = constructor.name

							if (!writerByType[type]) {
								writerByType[type] = writerByType[converter.asType || 'number']
							}
							isExtended = true
						}
					}
				} else if (type === 'boolean') {
					type = 'number'
				}
			} else if (type === 'boolean' || type === 'undefined') {
				type = 'number' // we treat number as the "open" type
			}
			if (property) {
				if (property.type === type/* && type !== Null*/) {
					structureEntry = property.index
				} else {
					var typedProperty = property[type]
					if (typedProperty) {
						property = typedProperty
						structureEntry = property.index
					} else {
						var writer = writerByType[type]
						if (!writer) {
							throw new Error('Unknown type ' + type)
						}
						property[type] = structureEntry = property = {
							index: propertyIndex++,
							key: key,
							type: type,
							writer: writer
						}
						if (isExtended) {
							property.isExtended = true
						}
						if (propertyIndex & 0x1ff === 0) {
							compactProperties()
						}
						if (type === 'string') {
							property.values = new Map()
						}
					}
				}
			} else {
				var writer = writerByType[type]
				if (!writer) {
					throw new Error('Unknown type ' + type)
				}
				properties.set(key, structureEntry = property = {
					index: propertyIndex++,
					type: type,
					key: key,
					writer: writer
				})
				if (isExtended) {
					property.isExtended = true
				}
				if (propertyIndex & 0x1ff === 0) {
					compactProperties()
				}
				if (type === 'string') {
					var strings = property.values = new Map()
				}
			}
			structureToWrite.push(structureEntry)
			structure.push(property)
			structureIndices.push(property.index)
			// if property is enum, use enum index
			values.push(value)
		}
		var structureKey = String.fromCodePoint.apply(null, structureIndices)
		// var structureKey = structure.join(',') // maybe safer?
		/* Is it faster to do?
		var structureEncoding = serialize(structure) // reuse structureEncoding in encoding structures
		var structryKey = structureEncoding.toString('binary')
		*/

		var structureDefinition = structures.get(structureKey)
		var structureRef
		if (structureDefinition) {
			var structureRef = structureDefinition.index
			var shortRef = structureRef & 0xf
			if (lastReferencedStructures[shortRef] === structureDefinition) {
				structureRef = shortRef
			} else {
				lastReferencedStructures[shortRef] = structureDefinition
			}
			writeToken(2, structureRef)
		} else {
			structures.set(structureKey, structureDefinition = {
				index: structureIndex++
			})
			if (structureIndex & 0x1ff === 0) {
				compactStructures()
			}
			lastReferencedStructures[structureDefinition.index & 0xf] = structureDefinition
			writeToken(1, structure.length)
			// if the structure isn't defined, we inline it.
			for (var i = 0, l = structure.length; i < l; i++) {
				var entry = structureToWrite[i]
				if (typeof entry === 'number') {
					var shortRef = entry & 0xf
					if (lastReferencedProperties[shortRef] === entry) {
						entry = shortRef
					} else {
						lastReferencedProperties[shortRef] = entry
					}
					writeToken(0, entry)
				} else {
					var key = entry.key
					lastReferencedProperties[entry.index & 0xf] = entry.index
					//var writer = entry.writer
					var propertyCode = entry.writer.propertyCode
					if (entry.isExtended || key.length === 0) { // extension
						writeToken(propertyCode, 0)
						writeOpen(key)
						writeOpen(entry.type)
					} else {
						writeToken(propertyCode, key.length)
						writeString(key)
					}
				}
			}
		}
		for (var i = 0, l = structure.length; i < l; i++) {
			currentProperty = structure[i]
			currentProperty.writer(values[i])
		}
	}

	var otherWrites = {
		number: function(number) {
			if (number >>> 0 === number || (number > 0 && number < 0x400000000000 && number % 1 === 0)) {
				// 46 bit unsigned integer
				writeToken(1, number)
			} else {
				var asString = number.toString()
				writeToken(2, asString.length)
				writeString(asString)
			}
		},
		boolean: function(value) {
			writeToken(0, value ? 2 : 1)
		},
		string: function(value) {
			writeToken(0, 6)
			writeInlineString(value)
		},
		object: function(object) {
			if (object) {
				var constructor = object.constructor
				if (constructor === Array) {
					writeArray(object, writeOpen)
					return
				}
				var constructorConverter = converterByConstructor.get(constructor)
				if (constructorConverter) {
					var convertedValue = constructorConverter(object)
					var type = constructor.name
					writeToken(0, 8)
					writeOpen(type)
					if (convertedValue === object) {
						writeToken(0, 5)
						writeObject(object)
					} else {
						writeOpen(convertedValue)
					}
				} else {
					writeToken(0, 5)
					writeObject(object)
				}
			} else { // null
				writeToken(0, 0)
			}
		},
		'function': function(value) {
			this.string('function ' + value.name + ' encountered')
		},
		symbol: function(symbol) {
			this.string(symbol.toString())
		},
		undefined: function() {
			writeToken(0, 3)
		}
	}
	var promisesToStart
	function writePromise(promise) { // in object mode
		var id = nextId++
		writeToken(0, id) // object reference
		writeObject({}) // object structure with no properties
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
						writeToken(0, 13) // start-block token (needs length)
						writeOpen(buffer.length) // write length
						writeBuffer(buffer)
						writeToken(0, 14) // end block
					} else {
						writeOpen(value)
					}
				}, function(error) {
					writeOpen(error.message)
				}).then(callback)
			}
		}
		pendingEncodings.push(lazyPromise)
	}


	function writeOpen(value) {
		var type = typeof value
		otherWrites[type](value)
	}

	function writeArray(array, writer) {
		writeToken(3, array.length)
		for (var i = 0, l = array.length; i < l; i++) {
			writer(array[i])
		}
	}

	function writeBlock(block, writer) {
		var id = nextId++
		writeToken(0, id)
		writeObject({}) // object structure with no properties
		var lazyPromise = {
			then: function(callback) {
				var startOffset = charEncoder.getOffset()
				writeToken(0, 11) // identified-value token
				writeOpen(id)
				writeToken(0, 13) // start-block token (needs length)
				var buffer = block[bufferSymbol]
				if (buffer) {
					writeOpen(buffer.length) // write length
					writeBuffer(buffer)
				} else {
					writeOpen(0) // length of zero if unknown
					writeOpen(block)
				}
				writeToken(0, 14) // end block
				callback()
			}
		}
		pendingEncodings.unshift(lazyPromise) // put it in front, since it is likely in memory right now
	}

	function writeInlineBuffer(buffer) {
		writeToken(0, 11)
		writeInlineString(buffer.toString('base64'))
	}

	var compactedStructures
	function compactStructures() {
		if (!compactedStructures) {
			compactedStructures = true
			return // skip the first time through
		}
		var middle = structureIndex === 0x200
		// shrink the structures down, so we don't reference beyond the 0x400 back-reference limit
		var keys = Array.from(structures.keys())
		for (var i = 0, l = keys.length; i < l; i++) {
			var key = keys[i]
			if (structures.get(key) >= 0x200 === middle) {
				// if we are in the middle, remove the top half, otherwise remove the bottom half of keys
				structure.delete(key)
			}
		}
		if (!middle) {
			structureIndex = 16
		}
	}
	var compactedProperties
	function compactProperties() {
		if (!compactedProperties) {
			compactedProperties = true
			return // skip the first time through
		}
		var middle = propertyIndex === 0x200
		// shrink the structures down, so we don't reference beyond the 0x400 back-reference limit
		var keys = Array.from(properties.keys())
		for (var i = 0, l = keys.length; i < l; i++) {
			var key = keys[i]
			if (properties.get(key).index >= 0x200 === middle) {
				// if we are in the middle, remove the top half, otherwise remove the bottom half of keys
				properties.delete(key)
			}
		}
		if (!middle) {
			propertyIndex = 16
		}
		structures.clear()// maybe we should filter them, but could be too expensive.
	}
	var serializer = {
		serialize: function(value) {
			var buffer = value && value[bufferSymbol]
			if (buffer) {
				charEncoder.writeBuffer(buffer)
				return
			}
			var startingOffset = charEncoder.getOffset()
			writeOpen(value)
			if (options.withLength || pendingEncodings.length > 0 && !options.outlet) {
				// if there are other blocks, and no outlet, we assign a length so lazy character decoding can be used
				var blockBufferLength = charEncoder.getOffset() - startingOffset
				var headerEncoder = (typeof global != 'undefined' && global.Buffer) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
				headerEncoder.writeToken(0, 12) // length-defined value
				headerEncoder.writeToken(1, blockBufferLength)
				charEncoder.insertBuffer(headerEncoder.getSerialized(), startingOffset)
			}
		},
		writeObject: writeObject,
		writeOpen: writeOpen,
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
	return date.getTime()
}


var bufferSymbol = require('./Block').bufferSymbol
var parsedSymbol = require('./Block').parsedSymbol
