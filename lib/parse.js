function createParser(options) {
	if (!options)
		options = {}
	var offset
	var source
	var property
	var lazy = options.lazy
	var classByName = options.classByName || new Map()
	classByName.set('Map', readMap)
	classByName.set('Set', readSet)
	classByName.set('Date', readDate)
	var readNext = options.utf16 ?
	function readNext(methods) {
		return function readNext() {
			var type, number
			var token = source.charCodeAt(offset++)
			type = token & 3 // last 2 bits for type
			number = token >>> 2 // 12 bit number
			if (token & 0x4000) { // continuation bit
				token = source.charCodeAt(offset++)
				number = ((number & 0xfff) << 14) + (token & 0x3fff) // 26 bit number
				if (token & 0x4000) { // continuation bit
					token = source.charCodeAt(offset++)
					number = (number << 14) + (token & 0x3fff) // 40 bit number
				}

			}
			return methods[type](number)



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
				return readInlineString(number) // non-referencable string, just return the value
			}
		},
		function(number) {
			var string = readInlineString(number)
			if (!property) {
				return string
			}
			var index = property.length
			if (index === 16) { // full set of values, do rotational index
				index = (property.valueIndex || 0) & 0xf
				property.valueIndex = index + 1
				property.values[index] = string
			} else {
				// push them on the first round
				(property.values || (property.values = [])).push(string)
			}
			return string
		},
		referenceString,
		readArray
	]
	var readObject = readNext(objectMethods)
	var readPropertyString = readNext(stringMethods)
	objectMethods[3] = readArray(readObject)
	stringMethods[3] = readArray(readPropertyString)

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
		readOpen,
		readExtended,
		readIdentifiedValue,
		readLengthDefinedBlock,
		endBlock,
		readBinary,
		readGzip,
	]
	var readOpen = readNext(openMethods)
	openMethods[3] = readArray(readOpen)
	var propertyMethods = [
		function(number) {
			return number // will dereference in the object method
		},
		namedProperty(readObject),
		namedProperty(readPropertyString),
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

	function readString() {
		property = null
		return readPropertyString()
	}

	function referenceString(number) {
		return property.values[number]
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
							parser.onResume = function(updatedString) {
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

	var properties = []
	var structures = []
	var nextPropertyIndex = 16
	var nextStructureIndex = 16
	var referenceableValues = []
	function objectByReference(reference) {
		if (reference === 0) {
			return null // zero byte
		}
		var inlineObject = readObject()
		var target = referenceableValues[reference]
		if (target) {
			Object.assign(target, inlineObject)
			return target
		}
		if (options.promiseReferenceMode) {
			return new Promise(function(resolve) {
				referenceableValues[reference] = resolve
			})
		} else {
			return referenceableValues[reference] = lazy ? makeBlockFromBuffer({
				parser: parser
			}) : inlineObject
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
						parser.onResume = function(updatedString) {
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

	function namedProperty(reader) {
		return function(number) {
			var property
			if (number == 0) {
				// extended mode
				property = {
					key: readOpen()
				}
				var className = readOpen()
				if (className) {
					var classDefinition = classByName.get(className)
					if (!classDefinition) {
						throw new Error('No reader defined for class ' + className)
					}
					property.readValue = classDefinition(parser)
				} else { // null class name means we don't have an extension, extension just used to handle empty string property name
					property.readValue = reader
				}
			} else {
				property = {
					key: readInlineString(number),
					readValue: reader
				}
			}
			var propertyIndex = nextPropertyIndex++
			properties[propertyIndex] = properties[propertyIndex & 0xf] = property
			if (propertyIndex === 0x400) {
				propertyIndex = 16
			}
			return property
		}
	}

	function readExtended() {
		var className = readOpen()
		var classDefinition = classByName.get(className)
		if (!classDefinition) {
			throw new Error('No reader defined for class ' + className)
		}
		return classDefinition(parser)()
	}
	var blockStack = []

	function beginBlock() {
		blockStack.push({
			properties: properties,
			structures: structures,
			nextPropertyIndex: nextPropertyIndex,
			nextStructureIndex: nextStructureIndex,
			referenceableValues: referenceableValues
		})
		properties = []
		structures = []
		nextPropertyIndex = 16
		nextStructureIndex = 16
		referenceableValues = []
		return readOpen()
	}
	function endBlock() {
		var blockToRestore = blockStack.pop()
		if (!blockToRestore) {
			throw new Error('End block token without start block token')
		}
		properties = blockToRestore.properties
		structures = blockToRestore.structure
		nextPropertyIndex = blockToRestore.nextPropertyIndex
		nextStructureIndex = blockToRestore.nextStructureIndex
		referenceableValues = blockToRestore.referenceableValues
	}

	function readLengthDefinedBlock() {
		readOpen() // don't do anything with the length token in this mode
		var blockDepth = blockStack.length
		var value = beginBlock()
		do {
			readOpen() // read until the end-document token
		} while(blockStack.length > blockDepth)
		return value
	}

	function readIdentifiedValue() {
		var parentReferenceableValues = referenceableValues
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
			var target = parentReferenceableValues[id]
			if (target) {
				if (typeof target === 'function') {
					target(value)
				} else {
					Object.assign(target, value)
				}
			} else {
				parentReferenceableValues[id] = value
			}
		}
	}

	function readGzip() {

	}
	function readBinary() {
		Buffer.from(readString(), 'base64')
	}

	var parser = {
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
		readObject: readObject,
	}
	return parser
}
exports.parse = function(stringOrBuffer, options) {
	var source
	if (typeof stringOrBuffer === 'string') {
		source = stringOrBuffer
	} else {
		source = stringOrBuffer.toString(options && options.encoding || 'utf8')
	}
	var parser = createParser(options).setSource(source)
	var result = parser.readOpen()
	while (parser.hasMoreData) {
		parser.readOpen() // read any referenced objects
	}
	return result
}
exports.parseLazy = function(buffer, parser) {
	return makeBlockFromBuffer(buffer, parser || createParser({
		lazy: true,
	}))
}
exports.createParser = createParser
const makeBlockFromBuffer = require('./Block').makeBlockFromBuffer
const bufferSymbol = require('./Block').bufferSymbol

function readMap(parser) {
	return function() {
		var keysAndValues = parser.readOpen()
		var keys = keysAndValues[0]
		var values = keysAndValues[1]
		var map = new Map()
		for (var i = 0, l = keys.length; i < l; i++) {
			map.set(keys[i], values[i])
		}
		return map
	}
}
function readSet(parser) {
	return function() {
		var values = parser.readOpen()
		var set = new Set(values)
		if (set.size === 0 && values.length > 0) {
			for (var i = 0, l = values.length; i < l; i++) {
				set.add(values[i])
			}
		}
		return set
	}
}
function readDate(parser) {
	return function() {
		var time = parser.readOpen()
		return new Date(time)
	}
}
