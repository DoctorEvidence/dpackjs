function nodeCharEncoder(options) {
	if (!options)
		options = {}
	var bufferSize = 256
	var offset = 0
	var end = bufferSize
	var buffer = Buffer.allocUnsafe(bufferSize)
	function makeRoom(bytesNeeded) {
		var oldBuffer = buffer
		bufferSize = end = bufferSize * 2 + bytesNeeded
		buffer = Buffer.allocUnsafe(bufferSize)
		oldBuffer.copy(buffer, 0, 0, offset)
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
		} else if (number < 0x400000000) { // 34 bits of number
			buffer[offset++] = (type << 4) + (number >>> 32)
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
	function writeString(string) {
		var maxStringLength = string.length * 4
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
		getEncoded
	}
}

function encode(object, options) {
	var charEncoder = typeof Buffer != 'undefined' ? nodeCharEncoder(options) : browserCharEncoder(options)
	var writeString = charEncoder.writeString
	var writeToken = charEncoder.writeToken
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

	function writeObject(object) {
		if (!object) {
			return writeToken(0, 0)
		}
		if (object instanceof Array) {
			return writeArray(object, writeObject)
		}
		const structure = []
		const structureIndices = []
		const structureToWrite = []
		const values = []
		const startingPropertyLength = propertyIndex
		var structureEntry
		for (const key in object) {
			let property = properties.get(key)
			let value = object[key]
			var type
			if (value instanceof Array) {
				for (var i = 0, l = value.length; i < l; i++) {
					var entryType = typeof value
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
				if (type === 'object') {
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
			if (number >>> 0 === number) {
				// 32 bit unsigned integer
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
				if (object instanceof Array) {
					writeArray(object, writeOther)
				} else {
					writeToken(0, 8)
					writeObject(object)
				}
			} else { // null
				writeToken(0, 0)
			}
		},
		undefined: function() {
			writeToken(0, 3)
		}
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

	writeOther(object)
	return charEncoder.getEncoded()
}
exports.encode = encode

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
