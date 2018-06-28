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
			type = (token >>> 4) & 3 // first two bits
			number = token & 0xf
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
							if (token < 0x40) {
								token = source.charCodeAt(offset++)
								number = (number << 6) + (token & 0x3f)
							}
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
			return number < 8 ? specificTypes[number] : specificTypes[number]()
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

	specificTypes = [
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
		isolatedTables
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
		return function readArray(number) {
			var array = []
			for (var i = 0; i < number; i++) {
				array.push(readValue(this))
			}
			return array
		}
	}

	const properties = []
	const structures = []
	const lastReferencedStructures = new Array(16)
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


	return {
		decode: function(stringOrBuffer, startOffset) {
			if (typeof stringOrBuffer === 'string') {
				source = stringOrBuffer
			} else {
				source = stringOrBuffer.toString()
			}
			offset = startOffset || 0
			return readOpen()
		},
		write(buffer) {

		}
	}
}
exports.decode = function(bufferOrString, options) {
	return createDecoder(options).decode(bufferOrString)
}
