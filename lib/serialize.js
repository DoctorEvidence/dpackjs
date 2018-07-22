"use strict"
var PREFERRED_MAX_BUFFER_SIZE = 0x8000

function nodeCharEncoder(options) {
	var bufferSize = 0x100
	var offset = 0
	var end = bufferSize
	var outlet = options.outlet
	var buffer = Buffer.allocUnsafe(bufferSize)
	function makeRoom(bytesNeeded) {
		if (outlet) {
			outlet.writeBytes(buffer.slice(0, offset))
			if (bufferSize < PREFERRED_MAX_BUFFER_SIZE || bytesNeeded > PREFERRED_MAX_BUFFER_SIZE) {
				bufferSize = end = Math.max(bufferSize * 2, bytesNeeded)
			}
			buffer = Buffer.allocUnsafe(bufferSize)
			offset = 0
		} else {
			bufferSize = end = Math.max(bufferSize * 2, bufferSize + bytesNeeded)
			var oldBuffer = buffer
			buffer = Buffer.allocUnsafe(bufferSize)
			oldBuffer.copy(buffer, 0, 0, offset)
		}
	}
	function flush() {
		outlet.writeBytes(buffer.slice(0, offset))
		//if (offset + 2000 > buffer.length)
			buffer = Buffer.allocUnsafe(bufferSize) // allocate a new buffer, don't want to overwrite the bytes in the old one while they are in use!
		/*else {// or continue to use the remaining space in this buffer, if there is a lot of room left
			buffer = buffer.slice(offset)
			end = buffer.length
		}*/
		offset = 0
	}
	var writeToken = options.utf8 ?
	function writeToken(type, number) {
		if (number >= 0x20000) {
			var token = ((number & 0x1ffff) << 2) + type + 0x80000
			offset += buffer.write(String.fromCodePoint(token), offset)
			offset += buffer.write(String.fromCodePoint(number >>> 17), offset)
		} else {
			var token = (number << 2) + type
			offset += buffer.write(String.fromCodePoint(token), offset)
		}
		if (offset > end - 8) {
			makeRoom(0)
		}
	} :
	function writeToken(type, number) {
		if (number < 0x10) { // 4 bits of number
			buffer[offset++] = (type << 4) + number + 0x40
		} else if (number < 0x400) { // 10 bits of number
			buffer[offset++] = (type << 4) + (number >>> 6)
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x10000) { // 16 bits of number
			buffer[offset++] = (type << 4) + (number >>> 12)
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x400000) { // 22 bits of number
			buffer[offset++] = (type << 4) + (number >>> 18)
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x10000000) { // 28 bits of number
			buffer[offset++] = (type << 4) + (number >>> 24)
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x100000000) { // 32 bits of number
			buffer[offset++] = (type << 4) + (number >>> 30)
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x400000000) { // 34 bits of number
			buffer[offset++] = (type << 4) + (number / 0x40000000 >>> 0)
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x10000000000) { // 40 bits of number
			buffer[offset++] = (type << 4) + (number / 0x1000000000 >>> 0)
			buffer[offset++] = (number / 0x40000000) & 0x3f
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x400000000000) { // 46 bits of number (needed for dates!)
			buffer[offset++] = (type << 4) + (number / 0x400000000000 >>> 0)
			buffer[offset++] = (number / 0x1000000000) & 0x3f
			buffer[offset++] = (number / 0x40000000) & 0x3f
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else {
			throw new Error('Too big of number')
		}
		if (offset > end - 6) {
			makeRoom(0)
		}
	}

	function writeBuffer(source) {
		var sourceLength = source.length
		if (sourceLength + offset + 6 > end) {
			makeRoom(sourceLength + 10)
		}
		source.copy(buffer, offset)
		offset += sourceLength
	}

	function writeString(string) {
		var maxStringLength = string.length * 3 + 10
		if (offset + maxStringLength > end) {
			makeRoom(maxStringLength)
		}
		var bytesWritten = buffer.write(string, offset)
		offset += bytesWritten
	}
	function getSerialized() {
		return buffer.slice(0, offset)
	}
	function writeBufferAtBeginning(headerBuffer) {
		var headerLength = headerBuffer.length
		if (offset + headerLength > end) {
			makeRoom(headerLength)
		}
		buffer.copy(buffer, headerLength, 0, offset)
		headerBuffer.copy(buffer)
		offset += headerLength
	}
	return {
		writeToken,
		writeString,
		writeBuffer,
		getSerialized,
		writeBufferAtBeginning,
		flush,
		getOffset() {
			return offset
		}
	}
}

function createSerializer(options) {
	if (!options)
		options = {}
	var maxReferenceableStringLength = options.maxReferenceableStringLength || 2400
	var writerByConstructor = options.writerByConstructor
	if (!writerByConstructor) {
		writerByConstructor = new Map()
	}
	writerByConstructor.set(serialize.Block, writeBlock)
	writerByConstructor.set(Map, writeMap)
	writerByConstructor.set(Set, writeSet)
	writerByConstructor.set(Date, writeDate)
	writerByConstructor.set(Array, writeArray)
	var charEncoder = typeof Buffer != 'undefined' ? nodeCharEncoder(options) : browserCharEncoder(options)
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
		Buffer: writeInlineBuffer,
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
			if (object.then)
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
			if (value) {
				if (type === 'object') {
					var constructor = value.constructor
					if (constructor === Array) {
						type = null // any type to start with
						for (var i = 0, l = value.length; i < l; i++) {
							var entry = value[i]
							if (entry !== null) {
								var entryType = typeof entry
								if (entryType === 'boolean') {
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
					} else if (constructor !== Object) {
						if (writerByConstructor.has(constructor)) {
							type = constructor.name
							if (!writerByType[type]) {
								writerByType[type] = writerByConstructor.get(constructor)(serializer)
								writerByType[type].propertyCode = 4 // extension propertyCode
							}
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
					if (propertyCode === 4 || key.length === 0) { // extension
						writeToken(1, 0)
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
			writeToken(0, 9)
			writeInlineString(value)
		},
		object: function(object) {
			if (object) {
				var constructor = object.constructor
				var constructorWriter = writerByConstructor.get(constructor)
				if (constructorWriter) {
					var type = constructor.name
					var writer = writerByType[type]
					if (!writer) {
						writerByType[type] = writer = writerByConstructor.get(constructor)(serializer)
						writer.propertyCode = 4 // extension propertyCode
					}
					if (writer.propertyCode > -1) {
						writeToken(0, writer.propertyCode + 7)
						if (writer.propertyCode > 3) {
							writeOpen(type)
						}
						writer(object)
					} else {// else an array, probably, which writes itself
						constructorWriter(object, writeOpen)
					}
				} else {
					writeToken(0, 8)
					writeObject(object)
				}
			} else { // null
				writeToken(0, 0)
			}
		},
		'function': function(value) {
			debugger
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
					writeToken(0, 12) // identified-value
					writeOpen(id)

					var buffer = value[bufferSymbol]
					if (buffer) {
						writeToken(0, 13) // start-section
						writeOpen(buffer.length)
						writeBuffer(buffer)
						writeToken(0, 14) // end-block
						return
					}
					writeOpen(value)
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
				writeToken(0, 12) // start-identified-block token
				writeOpen(id)
				var buffer = block[bufferSymbol]
				if (buffer) {
					writeBuffer(buffer)
				} else {
					writeOpen(0)
					writeOpen(block[parsedSymbol])
				}
				writeOpen(0, 14) // end block
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
		console.log('compact')
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
		console.log('compact properties')
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
			writeOpen(value)
			if (options.withLength || pendingEncodings.length > 0 && !options.outlet) {
				// if there are other blocks, and no outlet, we assign a length so lazy character decoding can be used
				var blockBuffer = charEncoder.getSerialized()
				var headerEncoder = typeof Buffer != 'undefined' ? nodeCharEncoder(options) : browserCharEncoder(options)
				headerEncoder.writeToken(0, 13)
				headerEncoder.writeToken(1, blockBuffer.length)
				charEncoder.writeBufferAtBeginning(headerEncoder.getSerialized())
			}
		},
		writeObject: writeObject,
		writeOpen: writeOpen,
		getSerialized: charEncoder.getSerialized,
		flush: charEncoder.flush,
		pendingEncodings: pendingEncodings,
	}
	return serializer
}
function serialize(value, options) {
	var serializer = createSerializer(options)
	serializer.serialize(value)
	var pendingEncodings = serializer.pendingEncodings
	if (pendingEncodings.length > 0) {
		return finishPending(serializer)
	}
	return serializer.getSerialized()
}
function finishPending(serializer) {
	var pendingEncodings = serializer.pendingEncodings
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
			return finishPending(serializer)
		})
	}
	return serializer.getSerialized()
}
exports.serialize = serialize
exports.createSerializer = createSerializer

function browserCharEncoder() {
	var serialized = ''
	function writeToken(type, number) {
		var codePoint
		if (number < 0x10) {
			codePoint = (type << 4) + number
		} else if (number < 0x100) {
			codePoint = (type << 8) + number
		} // ...
		serialized += String.fromCodePoint(codePoint)
	}
	function writeString(string) {
		serialized += string
	}
	function getSerialized() {
		return serialized
	}
}

function writeMap(serializer) {
	return function (map) {
		serializer.writeOpen([Array.from(map.keys()), Array.from(map.values())])
	}
}

function writeSet(serializer) {
	return function (set) {
		serializer.writeOpen(Array.from(set))
	}
}
function writeDate(serializer) {
	return function (date) {
		serializer.writeOpen(date.getTime())
	}
}


var bufferSymbol = require('./Block').bufferSymbol
var parsedSymbol = require('./Block').parsedSymbol
