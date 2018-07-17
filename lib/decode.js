function createDecoder(options) {
	if (!options)
		options = {}
	var offset
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
				number = (number << 6) + (token & 0x3f) // 10 bit number
				if (token < 0x40) {
					token = source.charCodeAt(offset++)
					number = (number << 6) + (token & 0x3f) // 16 bit number
					if (token < 0x40) {
						token = source.charCodeAt(offset++)
						number = (number << 6) + (token & 0x3f) // 22 bit number
						if (token < 0x40) {
							token = source.charCodeAt(offset++)
							number = (number << 6) + (token & 0x3f) // 28 bit number
							if (token < 0x40) {
								token = source.charCodeAt(offset++)
								number = (number * 0x40) + (token & 0x3f) // 34 bit number (we can't use 32-bit shifting operators anymore)
								if (token < 0x40) {
									token = source.charCodeAt(offset++)
									number = (number * 0x40) + (token & 0x3f) // 40 bit number
									if (token < 0x40) {
										token = source.charCodeAt(offset++)
										number = (number * 0x40) + (token & 0x3f) // 46 bit number, we don't go beyond this
									}
								}
							}
						}
					}
				}
				if (!(token >= 0)) {
					if (offset > source.length) {
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
		objectByReference,
		structureAndObject,
		objectByStructureReference,
		readArray
	]
	var stringMethods = [
		function(number) {
			if (number === 0) {
				return null
			} else {
				unknownType(number)
			}
		},
		function(number) {
			var string = readInlineString(number);
			(property.values || (property.values = [])).push(string)
			return string
		},
		referenceString,
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
		readReferenceableValue,
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
		var string = source.slice(offset, offset += number)
		if (offset > source.length) {
			throw new Error('BUFFER_SHORTAGE')
		}
		return string
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
					var addedInProgress
					if (error.whenResumed) {
						array.push(error.valueInProgress)
						addedInProgress = true
					} else {
						var types = this
						error.whenResumed = new Promise(function(resolve, reject) {
							decoder.onResume = function(updatedString) {
								// received more buffer, can continue
								source = updatedString
								offset = lastRead
								resolve(readValue(types)) // resume by reading current value
							}
						})
					}
					error.valueInProgress = array
					error.whenResumed = error.whenResumed.then(function(value) {
						// and continue
						if (!addedInProgress) { // don't do it twice
							array.push(value)
						}
						return readArray(number - array.length, array)
					})
				}
				throw error
			}
		}
	}

	const properties = []
	const structures = []
	let nextPropertyIndex = 16
	let nextStructureIndex = 16
	var referenceableValues = []
	function objectByReference(reference) {
		if (reference === 0) {
			return null // zero byte
		}
		var target = referenceableValues[reference]
		if (target) {
			return target
		}
		if (options.promiseReferenceMode) {
			return new Promise(function(resolve) {
				referenceableValues[reference] = resolve
			})
		} else {
			return referenceableValues[reference] = {}
		}
	}
	function objectByStructureReference(structureIndex) {
		var structure = structures[structureIndex]
		if (structureIndex >= 16) {
			structures[structureIndex & 0xf] = structure
		}
		return objectWithStructure(structure, {})
	}
	function structureAndObject(number) {
		var structure = new Array(number)
		for (var i = 0; i < number; i++) {
			// go through dereference properties and massage fixed value definitions
			var property = readProperty()
			if (typeof property === 'number') {
				if (property < 16) { // a short ref
					property = properties[property]
				} else { // long ref, but cache in the short ref range
					property = properties[property & 0xf] = properties[property]
				}

			}
			structure[i] = property
		}
		var structureIndex = nextStructureIndex++
		structures[structureIndex] = structures[structureIndex & 0xf] = structure
		if (nextStructureIndex === 0x400) {
			nextStructureIndex = 0x10
		}
		return objectWithStructure(structure, {})
	}
	function objectWithStructure(structure, object) {
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
				if (error.whenResumed) {
					object[key] = error.valueInProgress
				} else {
					error.whenResumed = new Promise(function(resolve, reject) {
						decoder.onResume = function(updatedString) {
							// received more buffer, can continue
							source = updatedString
							offset = lastRead
							resolve(property.readValue()) // resume by re-reading current value
						}
					})
				}
				error.valueInProgress = object

				error.whenResumed = error.whenResumed.then(function(value) {
					object[key] = value
					return objectWithStructure(structure.slice(i + 1), object)
				})
			}
			throw error
		}
		return object
	}

	function objectWithSizes(number) {
		// this is used for lazy access to a buffer, but if we have already parsed the buffer into a string, this doesn't
		// help us at this point, so just consume the property sizes
		for (var i = -1; i < number; i++) {
			readNumber()
		}
		return structureAndObject(number)
	}

	function namedProperty(reader) {
		return function(number) {
			var property = {
				key: readInlineString(number),
				readValue: reader
			}
			var propertyIndex = nextPropertyIndex++
			properties[propertyIndex] = properties[propertyIndex & 0xf] = property
			if (propertyIndex === 0x400) {
				propertyIndex = 16
			}
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

	function readReferenceableValue() {
		var id = readOpen()
		try {
			assignValue(readOpen())
		} catch (error) {
			if (error.message == 'BUFFER_SHORTAGE') {
				if (error.whenResumed) {
					error.whenResumed = error.whenResumed.then(assignValue)
				}
			}
			throw error
		}
		function assignValue(value) {
			var target = referenceableValues[id]
			if (target) {
				if (typeof target === 'function') {
					target(value)
				} else {
					Object.assign(target, value)
				}
			} else {
				referenceableValues[id] = value
			}
		}
	}

	function readGzip() {

	}
	function readBinary() {
		Buffer.from(readString(), 'base64')
	}

	var decoder = {
		setSource: function(string, startOffset) {
			source = string
			offset = startOffset || 0
			return this
		},
		get hasMoreData() {
			return source.length > offset
		},
		get offset() {
			return offset
		},
		referenceableValues: referenceableValues,
		readOpen: readOpen,
		readString: readString,
		readObject: readObject,
	}
	return decoder
}
exports.decode = function(stringOrBuffer, options) {
	var source
	if (typeof stringOrBuffer === 'string') {
		source = stringOrBuffer
	} else {
		source = stringOrBuffer.toString()
	}
	var decoder = createDecoder(options).setSource(source)
	var result = decoder.readOpen()
	while (decoder.hasMoreData) {
		decoder.readOpen() // read any referenced objects
	}
	return result
}
exports.decodeLazy = function(buffer, decoder) {
	return makeBlockFromBuffer(buffer, decoder || createDecoder())
}
exports.createDecoder = createDecoder
const makeBlockFromBuffer = require('./Block').makeBlockFromBuffer
