const PREFERRED_MAX_BUFFER_SIZE = 0x8000
function nodeCharEncoder(options) {
	if (!options)
		options = {}
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
				buffer = Buffer.allocUnsafe(bufferSize)
			}
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
		if (source.length + offset + 6 > end) {
			makeRoom(source.length + 10)
		}
		source.copy(buffer, offset)
	}

	function writeString(string) {
		var maxStringLength = string.length * 3 + 10
		if (offset + maxStringLength > end) {
			makeRoom(maxStringLength)
		}
		var bytesWritten = buffer.write(string, offset)
		offset += bytesWritten
	}
	function getEncoded() {
		return buffer.slice(0, offset)
	}
	return {
		writeToken,
		writeString,
		writeBuffer,
		getEncoded,
		flush
	}
}

function createEncoder(options) {
	var charEncoder = typeof Buffer != 'undefined' ? nodeCharEncoder(options) : browserCharEncoder(options)
	var writeString = charEncoder.writeString
	var writeToken = charEncoder.writeToken
	var writeBuffer = charEncoder.writeBuffer
	var pendingEncodings = []
	var properties = new Map()
	var propertyIndex = 0
	var structureIndex = 0
	var nextStringIndex = 0
	let lastReference = 0
	var structures = new Map()
	const lastReferencedStructures = new Array(16)
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
		} else {
			var values = property.values
			var stringIndex = values.get(string)
			if (stringIndex === undefined) {
				values.set(string, values.size)
				writeInlineString(string)
			} else {
				writeToken(0, values.size - stringIndex)
			}
		}
	}

	const objectTypes = {
		Array: writeArray,
		Document: writeDocument,
		Buffer: writeInlineBuffer,
	}
	function writeObject(object) {
		if (!object) {
			return writeToken(0, 0)
		}
		var className = object.constructor.name
		var classHandler = objectTypes[object.constructor.name]
		if (classHandler) {
			return classHandler(object, writeObject)
		}
		const structure = []
		const structureIndices = []
		const structureToWrite = []
		const values = []
		const startingPropertyLength = propertyIndex
		var structureEntry
		for (let key in object) {
			key = key.toString()
			let property = properties.get(key)
			let value = object[key]
			var type
			if (value instanceof Array) {
				for (var i = 0, l = value.length; i < l; i++) {
					var entryType = typeof value
					if (value && entryType === 'object' && (objectTypes[value.constructor.name] || value.then)) {
						entryType = 'open'
					}
					if (entryType !== type) {
						if (!type) {
							type = entryType
						} else {
							type = 'mixed'
							break;
						}
					}
				}
			} else {
				type = typeof value
			}
			if (property) {
				structureEntry = startingPropertyLength - property.index
				if (type === 'object' && !(value && (objectTypes[value.constructor.name] || value.type))) {
					if (!property.isObject && value !== null) {
						if (property.asObject) {
							property = property.asObject
							structureEntry = startingPropertyLength - property.index
						} else {
							property = structureEntry = property.asObject = {
								index: propertyIndex++,
								key: key
							}
						}
					}
				} else if (type === 'string') {
					// set string enums that we can reference
					if (!property.isString) {
						if (property.asString) {
							property = property.asString
							structureEntry = startingPropertyLength - property.index
						} else {
							property = structureEntry = property.asString = {
								values: new Map(),
								index: propertyIndex++,
								key: key
							}
						}
					}
				} else {
					if (!property.isOther) {
						if (property.asOther) {
							property = property.asOther
							structureEntry = startingPropertyLength - property.index
						} else {
							property = structureEntry = property.asOther = {
								index: propertyIndex++,
								key: key
							}
						}
					}
				}
			} else {
				properties.set(key, structureEntry = property = {
					index: propertyIndex++,
					key: key
				})
				if (type === 'object') {
					property.isObject = true
				} else if (type === 'string') {
					const strings = property.values = new Map()
					property.isString = true
				} else {
					property.isOther = true
				}
			}
			structureToWrite.push(structureEntry)
			structure.push(property)
			structureIndices.push(property.index)
			// if property is enum, use enum index
			values.push(value)
		}
		const structureKey = String.fromCodePoint.apply(null, structureIndices)
		// var structureKey = structure.join(',') // maybe safer?
		/* Is it faster to do?
		var structureEncoding = encode(structure) // reuse structureEncoding in encoding structures
		var structryKey = structureEncoding.toString('binary')
		*/

		let structureDefinition = structures.get(structureKey)
		let structureRef
		if (structureDefinition) {
			structureRef = structures.size - structureDefinition.index
			const shortRef = 0x0f & structureRef
			if (lastReferencedStructures[shortRef] === structureDefinition) {
				writeToken(2, shortRef)
			} else {
				lastReferencedStructures[shortRef] = structureDefinition
				writeToken(0, structureRef)
			}
		} else {
			structures.set(structureKey, structureDefinition = {
				index: structures.size
			})
			lastReferencedStructures[0] = structureDefinition
			writeToken(1, structure.length)
			// if the structure isn't defined, we inline it.
			for (var i = 0, l = structure.length; i < l; i++) {
				var entry = structureToWrite[i]
				if (typeof entry === 'number') {
					writeToken(0, entry)
				} else {
					var key = entry.key
					if (entry.isString) {
						writeToken(2, key.length)
					} else if (entry.isObject) {
						writeToken(1, key.length)
					} else {
						writeToken(3, key.length)
					}
					writeString(key)
				}
			}
		}
		for (var i = 0, l = structure.length; i < l; i++) {
			property = structure[i]
			var value = values[i]
			if (property.isString) {
				writeStringProperty(value)
			} else if (property.isObject) {
				writeObject(value)
			} else {
				writeOther(value)
			}
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
				var constructorWriter = byConstructor[object.constructor.name]
				if (constructorWriter) {
					constructorWriter(object, writeOther)
				} else if (object.then) {
					writePromise(object)
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
	var byConstructor = {
		Array: writeArray,
		Promise: writePromise,
		Map: writeMap,
		Set: writeSet,
		Buffer: writeInlineBuffer
	}
	var promisesToStart
	function writePromise(promise) {
		var id = nextId++
		writeToken(0, 15)
		writeOther(id)
		var lazyPromise = {
			then: function(callback) {
				return promise.then(function(value) {
/*					if (inLazyDocument) {
						var valueBuffer = writeOther(value)
						writeToken(0, 13)
						writeFixed(length)
						writeToken(0, 14)
						writeFixed(id)
						writeBuffer(valueBuffer)
					} else
					*/
					writeToken(0, 14)
					writeOther(id)
					writeOther(value)
				}, function(error) {
					writeOther(error.message)
				}).then(callback)
			}
		}
		if (!outlet) {
			lazyPromise = lazyPromise.then()
		}
		this.pendingEncodings(lazyPromise)
	}


	function writeOther(value) {
		var type = typeof value
		otherWrites[type](value)
	}

	function writeArray(array, writer) {
		writeToken(3, array.length)
		for (var i = 0, l = array.length; i < l; i++) {
			writer(array[i])
		}
	}

	function writeDocument(document, writer) {
		var docBuffer = document[Symbol('docBuffer')]
		if (docBuffer) {
			writeToken(0, 12)
			writeBuffer(docBuffer)
			return
		}
		var startOffset = offset
		var charEncoder = nodeCharEncoder()
		var keyCount = 0
		for (var key in document) {
			key = key.toString()
			charEncoder.writeToken(2, key.length)
			charEncoder.writeString(key)
			keyCount++
		}
		var structureBuffer = charEncoder.getEncoded()
		charEncoder = nodeCharEncoder()
		charEncoder.writeToken(0, 12) // position parameter object type
		charEncoder.writeToken(1, keyCount) // object token with property count
		const declarationBuffer = charEncoder.getEncoded()

		let headerSize = structureBuffer.length + (keyCount + 1) * 6 + declarationBuffer.length
		let positionBuffer = Buffer.allocUnsafe((keyCount + 1) * 6)
		var headerOffset = 0
		writeFixedToken(headerSize)

		const valueBuffers = []
		for (var key in document) {
			key = key.toString()
			var valueBuffer = encode(document[key])
			valueBuffers.push(valueBuffer)
			writeFixedToken(valueBuffer.length)
		}

		writeBuffer(positionBuffer)
		writeBuffer(structureBuffer)

		for (var i = 0, l = valueBuffers.length; i < l; i++) {
			writeBuffer(valueBuffers[i])
		}

		function writeFixedToken(number) {
			// we write this all as fixed 6 byte token, so we can compute the header size ahead of time.
			positionBuffer[headerOffset++] = number / 0x40000000 >>> 0
			positionBuffer[headerOffset++] = (number >>> 24) & 0x3f
			positionBuffer[headerOffset++] = (number >>> 18) & 0x3f
			positionBuffer[headerOffset++] = (number >>> 12) & 0x3f
			positionBuffer[headerOffset++] = (number >>> 6) & 0x3f
			positionBuffer[headerOffset++] = (number & 0x3f) + 0x40
		}
	}

	function writeInlineBuffer(buffer) {
		writeToken(0, 11)
		writeInlineString(buffer.toString('base64'))
	}
	function writeDate(date) {
		writeToken(0, 10)
		writeToken(1, date.getTime())
	}
	return {
		encode: function(value) {
			writeOther(value)
		},
		getEncoded: charEncoder.getEncoded,
		flush: charEncoder.flush,
		pendingEncodings: pendingEncodings,
	}
}
exports.encode = function encode(value) {
	var encoder = createEncoder()
	encoder.encode(value)
	return encoder.getEncoded()
}
exports.createEncoder = createEncoder

function browserCharEncoder() {
	var encoded = ''
	function writeToken(type, number) {
		var codePoint
		if (number < 0x10) {
			codePoint = (type << 4) + number
		} else if (number < 0x100) {
			codePoint = (type << 8) + number
		} // ...
		encoded += String.fromCodePoint(codePoint)
	}
	function writeString(string) {
		encoded += string
	}
	function getEncoded() {
		return encoded
	}
}

function writeMap(map, write) {
	write(Array.from(map.keys()))
	write(Array.from(map.values()))
}

function writeSet(set, writeOther) {
	write(Array.from(set))
}
