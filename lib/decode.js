function createDecoder(options) {
	if (!options)
		options = {}
	var number
	var source
	var property
	var readNext = options.utf8 ?
	function readNext(methods) {
		return function readNext() {
			var token = source.codePointAt(offset++)
			if (token > 0xffff) {
				offset++ // it takes up two characters
			}
			var number = token >> 2
			var type = token & 3
			if (number >= 0x20000) { // double code point encoding
				number = (number & 0x1ffff) + ((token = source.codePointAt(offset++)) << 17)
				if (token > 0xffff) {
					offset++
				}
			} else if (token === undefined) {
				if (offset > source.length) {
					offset--
					throw new Error('BUFFER_SHORTAGE')
				}
			}
			return methods[type](number)
		}
	} :
	function readNext(methods) {
		return function readNext() {
			var type, number
			var token = source.charCodeAt(offset++)
			type = (token >>> 4) & 11 // shift and omit the stop bit (bit 3)
			number = token & 0xf
			if (token & 0x40) { // fast path for one byte with stop bit
				return methods[type](number)
			} else {
				token = source.charCodeAt(offset++)
				number = (number << 6) + (token & 0x3f)
				if (token < 0x40) {
					token = source.charCodeAt(offset++)
					number = (number << 6) + (token & 0x3f)
					if (token < 0x40) {
						token = source.charCodeAt(offset++)
						number = (number << 6) + (token & 0x3f)
						if (token < 0x40) {
							token = source.charCodeAt(offset++)
							number = (number << 6) + (token & 0x3f)
							if (token < 0x40) {
								token = source.charCodeAt(offset++)
								number = (number << 6) + (token & 0x3f)
							}
						}
					}
				} else if (token === undefined) {
					if (offset > source.length) {
						offset--
						throw new Error('BUFFER_SHORTAGE')
					}
				}
				return methods[type](number)
			}
		}
	}
/* The ascii variant
	function readNext(methods) {
		return function() {
			var token = source.codePointAt(offset++)
			var type = token >>> 5
			var number = token & 0xf
			if (token & 0x10) {
				token = source.codePointAt(offset++)
				number = (number << 6) + token & 0x3f
				if (token & 0x40) {
					token = source.codePointAt(offset++)
					number = (number << 6) + token & 0x3f
					if (token & 0x40) {
						token = source.codePointAt(offset++)
						number = (number << 6) + token & 0x3f
						if (token & 0x40) {
							token = source.codePointAt(offset++)
							number = (number << 6) + token & 0x3f
							if (token & 0x40) {
								token = source.codePointAt(offset++)
								number = (number << 6) + token & 0x3f
							}
						}
					}
				}
			}
			if (!(number > -1)) {
				if (offset > source.length) {
					offset--
					throw new Error('BUFFER_SHORTAGE')
				}
			}
			return methods[type](number)
		}
	} */
	var objectMethods = [
		mapByStructureReference,
		structureAndMap,
		mapByShortRef,
		readArray
	]
	var stringMethods = [
		referenceString,
		function(number) {
			var string = readInlineString(number);
			(property.values || (property.values = [])).push(string)
			return string
		},
		unknownType,
		readArray
	]
	var numberMethods = [
		function(number) {
			return +readInlineString(number)
		},
		function(number) {
			return -readInlineString(number)
		},
		function(number) {
			return number
		},
		function(number) { // negative
			return -number
		},
		readArray,
	]
	var readObject = readNext(objectMethods)
	var readString = readNext(stringMethods)
	var readNumber = readNext(numberMethods)
	objectMethods[3] = readArray(readObject)
	stringMethods[3] = readArray(readString)

	var openMethods = [
		function(number) {
			if (number < 8) {
				return specificTypes[number]
			}
			if (!specificTypes[number]) {
				throw new Error('Unknown open type ' + number)
			}
			return specificTypes[number]()
		},
		function(number) {
			return number
		},
		function(number) {
			return +readInlineString(number)
		},
		readArray,
		/*readObject,
		readString,
		readNumber,
		function(number) {
			extension()
		},*/
	]

	var specificTypes = [
		null,
		false,
		true,
		undefined,
		NaN,
		Infinity,
		-NaN,
		undefined,
		readObject,
		readString,
		readDate,
		isolatedTables,
		readPositionalObject,
		readBinary,
		undefined,
		readGzip,
	]
	var readOpen = readNext(openMethods)
	openMethods[3] = readArray(readOpen)
	var propertyMethods = [
		function(number) {
			return number // will dereference in the object method
		},
		namedProperty(readObject),
		namedProperty(readString),
		namedProperty(readOpen)
	]
	var readProperty = readNext(propertyMethods)
	function readInlineString(number) {
		return source.slice(offset, offset += number)
	}

	function referenceString(number) {
		if (number === 0) {
			// zero byte, actually null
			return null
		}
		return property.values[property.values.length - number]
	}

	function unknownType(number) {
		throw new Error('Unknown type ' + number)
	}
	function readArray(readValue) {
		return function readArray(number, startingArray) {
			var array = startingArray || []
			var lastRead
			try {
				for (var i = 0; i < number; i++) {
					lastRead = offset
					array.push(readValue(this))
				}
				return array
			} catch (error) {
				if (error.message == 'BUFFER_SHORTAGE') {
					if (error.valueInProgress !== undefined) {
						array.push(error.valueInProgress)
					}
					error.valueInProgress = array
					if (!error.whenResumed) {
						error.whenResumed = new Promise(function(resolve, reject) {
							decoder.onResume = function(updatedString) {
								// received more buffer, can continue
								source = updatedString
								offset = lastRead
								resolve()
							}
						})
					}

					error.whenResumed = error.whenResumed.then(function() {
						return readArray(number - array.length, array)
					})
				}
				throw error
			}
		}
	}

	const properties = []
	const structures = []
	const lastReferencedStructures = new Array(16)
	var referenceableObjects = []
	function mapByShortRef(shortRef) {
		return mapWithStructure(lastReferencedStructures[shortRef], {})
	}
	function mapByStructureReference(structureIndex) {
		if (structureIndex === 0) {
			return null // zero byte
		}
		var structureRef = structures.length - structureIndex
		return mapWithStructure(lastReferencedStructures[0x0f & structureIndex] = structures[structureRef], {})
	}
	function structureAndMap(number) {
		var structure = new Array(number)
		var propertyLength = properties.length // should be computed from the property size at the beginning
		for (var i = 0; i < number; i++) {
			// go through dereference properties and massage fixed value definitions
			var property = readProperty()
			if (typeof property === 'number') {
				property = properties[propertyLength - property]
			}
			structure[i] = property
		}
		lastReferencedStructures[0] = structure
		structures.push(structure)
		return mapWithStructure(structure, {})
	}
	function mapWithStructure(structure, object) {
		var lastRead
		try {
			for (var i = 0, l = structure.length; i < l; i++) {
				lastRead = offset
				property = structure[i] // scoped outside so it can be used to resolve value
				var key = property.key
				var value = property.readValue()
				object[key] = value
			}
		} catch (error) {
			if (error.message == 'BUFFER_SHORTAGE') {
				if (error.valueInProgress !== undefined) {
					object[property] = error.valueInProgress
				}
				error.valueInProgress = object
				if (!error.whenResumed) {
					error.whenResumed = new Promise(function(resolve, reject) {
						decoder.onResume = function(updatedString) {
							// received more buffer, can continue
							source = updatedString
							offset = lastRead
							resolve()
						}
					})
				}

				error.whenResumed = error.whenResumed.then(function() {
					return mapWithStructure(structureRef, object)
				})
			}
			throw error
		}
		return object
	}

	function mapWithSizes(number) {
		// this is used for lazy access to a buffer, but if we have already parsed the buffer into a string, this doesn't
		// help us at this point, so just consume the property sizes
		for (var i = -1; i < number; i++) {
			readNumber()
		}
		return structureAndMap(number)
	}

	function namedProperty(reader) {
		return function(number) {
			var property = {
				key: readInlineString(number),
				readValue: reader
			}
			properties.push(property)
			return property
		}
	}

	function isolatedTables() {
		var decoder = createDecoder()
		return decoder.decode(source, offset)
	}

	function readDate() {
		read
	}

	function readPositionalObject() {
		readNumber
	}

	function readGzip() {

	}
	function readBinary() {
		Buffer.from(readString(), 'base64')
	}

	return {
		setSource: function(string, startOffset) {
			source = string
			offset = startOffset || 0
			return this
		},
		get hasMoreData() {
			return source.length > offset
		},
		referenceableObjects: referenceableObjects,
		readOpen: readOpen,
		readString: readString,
		readObject: readObject
	}
}
exports.decode = function(stringOrBuffer, options) {
	var source
	if (typeof stringOrBuffer === 'string') {
		source = stringOrBuffer
	} else {
		source = stringOrBuffer.toString()
	}
	return createDecoder(options).setSource(source).readOpen()
}
exports.decodeLazy = function(buffer, options) {
	return new Proxy({
		buffer: buffer,
		decoder: createDecoder(options)
	}, decodeOnDemand)
}
exports.createDecoder = createDecoder

var decodeOnDemand = {
	get(target, key) {
		var decoded = target.decodedDPack
		if (!decoded) {
			if (key == 'constructor')
				return new Document(target)
			decoded = decodeOnDemand.getDecoded(target)
		}
		return decoded[key]
	},
	set(target, key, value) {

	},
	getOwnPropertyDescriptor(target, key) {
		var decoded = decodeOnDemand.getDecoded(target)
		return Object.getOwnPropertyDescriptor(decoded, key)
	},
	has(target, key) {
		var decoded = decodeOnDemand.getDecoded(target)
		return key in decoded
	},
	getDecoded(target) {
		var decoded = target.decodedDPack
		if (decoded)
			return decoded
		var buffer = target.buffer
		var primaryBuffer
		var firstByte = buffer[0]
		if (firstByte === 0x4b) {
			var referenceableObjects = decoder.referenceableObjects
			var id = decoder.setSource(buffer.slice(1, 13).toString()).readOpen()
			var length = decoder.readOpen() // read next block as number
			primaryBuffer = buffer.slice(0, length)
			var offset = length
			// now iterate through any other referable/lazy objects and declare them
			while (offset < buffer.length) {
				firstByte = buffer[0]
				if (firstByte === 0x4b) {
					id = decoder.setSource(buffer.slice(offset + 1, offset + 13).toString()).readOpen()
					length = decoder.readOpen()
					var nextBuffer = buffer.slice(offset, offset += length)
					referenceableObjects[id] = new Proxy({
						buffer: nextBuffer,
						decoder: decoder
					})
				}
			}
		} else {
			primaryBuffer = buffer
		}
		return target.decodedDPack = decode(primaryBuffer)
	},
	ownKeys(target) {
		var decoded = unpackOnDemand.getDecoded(target)
		return Object.keys(decoded)
	}
}
