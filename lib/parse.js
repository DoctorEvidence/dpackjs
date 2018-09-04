"use strict"
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
	var typeProperty = { index: 0 }
	var fastStrings = []
	var parentBlocks = []
	var blocks = []
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
					throw new Error('Unexpected end of dpack stream')
				}
			}
			return methods[type](number)
		}
	} :
	function readNext(methods) {
		return function readNext() {
			var type, number
			var token = source.charCodeAt(offset++)
			if (token >= 0x40) { // fast path for one byte with stop bit
				if (token > 0x4000) // long-token handling
					return methods[(token >>> 12) & 3](token & 0xfff)
				return methods[(token >>> 4) & 3](token & 0xf)
			} else {
				type = (token >>> 4) & 11 // shift and omit the stop bit (bit 3)
				number = token & 0xf
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
						throw new Error('Unexpected end of dpack stream')
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
					throw new Error('Unexpected end of dpack stream')
				}
			}
			return methods[type](number)
		}
	} */


	var defaultMethods = [
		typedArray,
		0,
		readInlineString,
		readAsNumberOrBoolean
	]
	var readAsDefault = readNext(defaultMethods)
	readAsDefault.readTypedElements = defaultMethods[1] = readArray(readAsDefault)

	function typedArray(length, reader) {
		if (length === 0) {
			return null // typed array of length 0 always means null
		}
		var lastRead = offset
		try {
			reader = reader || readAsType() // read the type
			if (length === 2) {
				return reader() // just read the next element
			} else if (reader.readTypedElements) {
				return reader.readTypedElements(length - 1) // let the element reader read the remaining elements
			}
		} catch(error) {
			handlePossiblePause(error, {
				parser: parser,
				paused: function(value) {
					if (!reader) {
						reader = value
					}
				},
				resume: function() {
					offset = lastRead
				},
				resumed: function(value) {
					return typedArray(length, reader)
				}
			})
		}
	}

	function readAsNumberOrBoolean(number) {
		if (number >= 4) {
			return number - 4
		} else if (number === 0) {
			return false
		} else if (number === 1) {
			return true
		}
		// return undefined
	}

	function arrayToObject(length) {
		var readTypedElements = recentStructures[length]
		return readTypedElements(length)
	}

	var objectMethods = [
		typedArray,
		arrayToObject,
		readInlineString,
		objectByReference
	]
	var stringMethods = [
		typedArray,
		0,
		function(number) {
			var string = readInlineString(number)
			var index = strings.push(string) - 1
			fastStrings[((property.index || 0) << 4) | (index & 0xf)] = string
			return string
		},
		referenceString
	]
	var readAsObject = readNext(objectMethods)

	var readAsString = readNext(stringMethods)
	readAsString.readTypedElements = stringMethods[1] = readArray(readAsString)

	var numberMethods = [
		typedArray,
		0,
		function(number) {
			return +readInlineString(number)
		},
		function(number) {
			return number
		}
	]
	var readAsNumber = readNext(numberMethods)
	readAsNumber.readTypedElements = numberMethods[1] = readArray(readAsNumber)

	function readAsArray(type) {
		var readArrayElements = readArray(type)
		var arrayMethods = [
			typedArray,
			readArrayElements,
			function(number) {
				return number
			},
			readInlineString
		]
		var readAsArray = readNext(arrayMethods)
		readAsArray.readTypedElements = readArrayElements
		return readAsArray
	}

	function readBlockContents(length, i, value) {
		var parentTypes = types
		var parentStrings = strings
		var parentFastStrings = fastStrings
		var lastRead
		try {
			types = types.slice(0, 8)
			strings = []
			fastStrings = []
			parentBlocks = blocks
			blocks = []
			for (i = 0; i < length; i++) {
				lastRead = offset
				var blockValue = readAsBlock()
				if (blockValue !== undefined) {
					value = blockValue
				}
			}
			return value
		} catch (error) {
			handlePossiblePause(error, {
				parser: parser,
				resume: function() {
					offset = lastRead
				},
				resumed: function() {
					return readBlockContents(length, i, value)
				}
			})
		} finally {
			types = parentTypes
			strings = parentStrings
			blocks = parentBlocks
			fastStrings = parentFastStrings
		}
	}

	function readBlockElements(length) {
		var id = readAsDefault()
		var imports = readAsDefault()
		var byteLength = readAsNumber()
		var blockValue = readBlockContents(length - 3, 0)
		if (id === null) {
			// primary value, return it
			return blockValue
		}
		// else the id goes in our blocks map
		var block = blocks[id]
		if (block) {
			Object.assign(block, blockValue)
		} else {
			blocks[id] = blockValue
		}
	}
	var blockMethods = [
		typedArray,
		readBlockElements,
		function(number) {
			var string = readInlineString(number)
			var block = parentBlocks[string]
			if (!block) {
				block = parentBlocks[string] = {}
			}
			return block
		},
		function(number) {
			var block = parentBlocks[number]
			if (!block) {
				block = parentBlocks[number] = {}
			}
			return block
		}
	]
	var readAsBlock = readNext(blockMethods)
	readAsBlock.readTypedElements = readBlockElements

	var types = [
		readAsDefault,
		readAsObject,
		readAsNumber,
		readAsString,
		readAsArray(readAsObject),
		readAsBlock,
		null,
		null
	]

	var typeMethods = [
		function(length) {
			var type = readAsType()
			return type(length - 1)
		},
		readTypedObject,
		readInlineString,
		function(reference) {
			return types[reference]
		}
	]
	var readAsType = readNext(typeMethods)

	function readTypedObject(length, structure, startingIndex, key) {
		structure = structure || []
		var lastRead
		try {
			property = typeProperty
			var key
			for (var i = startingIndex || 0; i < length; i++) {
				lastRead = offset
				if (i % 2 === 0) {
					key = readAsString()
				} else {
					structure.push({
						index: (i + 1) >>> 1,
						key: key,
						readValue: readAsType()
					})
				}
			}
		} catch (error) {
			handlePossiblePause(error, {
				parser: parser,
				resume: function() {
					offset = lastRead
				},
				resumed: function() {
					return readTypedObject(number, structure, i, key)
				}
			})
		}

		var readObjectElements = function(length, object, index) {
			recentStructures[length] = readObjectElements // store it in recent structures for quick reuse
			object = object || {}
			var lastRead
			try {
				for (var i = 0; i < length; i++) {
					lastRead = offset
					property = structure[i] // scoped outside so it can be used to resolve value
					var key = property.key
					var value = property.readValue()
					if (value !== undefined)
						object[key] = value
				}
			} catch (error) {
				handlePossiblePause(error, {
					parser: parser,
					value: object,
					paused: function(value) {
						object[key] = value
					},
					resume: function() {
						offset = lastRead
						return property.readValue()
					},
					resumed: function(value) {
						object[key] = value
						return readObjectElements(structure.slice(i + 1), object)
					}

				})
			}
			return object
		}
		if (length > 0 && structure[0].key === null) {
			// has a class definition
			var className = structure[0].readValue
			structure.shift()
			var extensionClass = classByName.get(className)
			if (extensionClass.fromArray) {
				var readAndConvertArray = readArray(readAsDefault, extensionClass.fromArray)
				readObjectElements = function(length) {
					recentStructures[length] = readObjectElements // store it in recent structures for quick reuse
					return readAndConvertArray(length)
				}
			} else {
				var readObjectElementsWithClass = readObjectElements
				readObjectElements = function(length) {
					return readObjectElementsWithClass(length, new extensionClass())
				}
			}
		}
		var objectMethods = [
			typedArray,
			readObjectElements,
			objectByReference,
			objectByReference
		]
		var readAsObject = readNext(objectMethods)
		readAsObject.readTypedElements = readObjectElements
		types.push(readAsObject)
		return readAsObject
	}

	function classConstructor(className, readObjectElements) {
		classByName.get(className)
		return function(length) {
			if (converter) {
				converter(readAsDefault())
				return readObjectElements(length - 1)
			}
		}
		readObjectElements
	}

	function readInlineString(number) {
		var string = source.slice(offset, offset += number)
		if (offset > source.length) {
			throw new Error('Unexpected end of dpack stream')
		}
		return string
	}

	function readString() {
		property = null
		return readAsString()
	}

	function referenceString(number) {
		if (number < 16) {
			return fastStrings[((property.index || 0) << 4) | number]
		}
		var string = strings[number - 16]
		fastStrings[((property.index || 0) << 4) | (number & 0xf)] = string
		return string
	}

	function unknownType(number) {
		throw new Error('Unknown type ' + number)
	}
	function readArray(readValue, transform) {
		return function readArray(number, startingArray, startingIndex) {
			var array = startingArray || []
			var lastRead
			try {
				for (var i = startingIndex || 0; i < number; i++) {
					lastRead = offset
					array.push(readValue(this))
				}
				if (transform) {
					return transform(array)
				}
				return array
			} catch (error) {
				var types = this
				handlePossiblePause(error, {
					parser: parser,
					value: array,
					paused: function(value) {
						array.push(value)
					},
					resume: function() {
						offset = lastRead
						return readValue(types)
					},
					resumed: function(value) {
						if (i === array.length) {
							array.push(value) // if we haven't added it yet, do so now
						}
						return readArray(number, array, array.length)
					}
				})
			}
		}
	}

	var strings = []
	var nextPropertyIndex = 16
	var nextStructureIndex = 5
	var referenceableValues = []
	var recentStructures = []

	var unfulfilledReferences = 0
	function objectByReference(reference) {
		if (reference === 0) {
			return null // zero byte
		}
		var inlineObject = readAsObject()
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
			var hasProperties
			for (var key in inlineObject) {
				hasProperties = true
				break
			}
			if (!hasProperties) {
				unfulfilledReferences++
			}
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
	function structureAndObject(number, structure, startingIndex) {
		structure = structure || new Array(number)
		var lastRead
		try {
			for (var i = startingIndex || 0; i < number; i++) {
				lastRead = offset
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
		} catch (error) {
			handlePossiblePause(error, {
				parser: parser,
				resume: function() {
					offset = lastRead
				},
				resumed: function() {
					return structureAndObject(number, structure, i)
				}
			})
		}
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
				if (value !== undefined)
					object[key] = value
			}
		} catch (error) {
			handlePossiblePause(error, {
				parser: parser,
				value: object,
				paused: function(value) {
					object[key] = value
				},
				resume: function() {
					offset = lastRead
					return property.readValue()
				},
				resumed: function(value) {
					object[key] = value
					return objectWithStructure(structure.slice(i + 1), object)
				}

			})
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
				var classConverter = classByName.get(className)
				if (classConverter) {
					property.readValue = function() {
						return classConverter(reader())
					}
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
		var classConverter = classByName.get(className)
		if (!classConverter) {
			if(options.throwOnMissingClass)
				throw new Error('No reader defined for class ' + className)
			return readOpen() // else just don't convert
		}
		return classConverter(readOpen())
	}
	var blockStack = []

	function readLengthDefinedValue() {
		readOpen() // don't do anything with the length token in this mode
		return readOpen() // this is the actual value
	}

	function readLengthDefinedBlock() {
		readOpen() // don't do anything with the length token in this mode
		var blockDepth = blockStack.length
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
		var lastRead
		var value
		var readValue
		function readBlockContents() {
			try {
				lastRead = offset
				if (!readValue) {
					value = readOpen() // read the main value
					readValue = true
				}
				do {
					lastRead = offset
					readOpen() // read until the end-document token
				} while(blockStack.length > blockDepth)
				return value
			} catch (error) {
				handlePossiblePause(error, {
					parser: parser,
					value: value,
					resume: function() {
						offset = lastRead
						if (!readValue) {
							value = readOpen() // read the main value
							readValue = true
						}
						return value
					},
					resumed: function(finishedValue) {
						if (!readValue) {
							value = finishedValue
							readValue = true
						}
						return readBlockContents()
					},
				})
			}
		}
		return readBlockContents()
	}

	function endBlock() {
		var blockToRestore = blockStack.pop()
		if (!blockToRestore) {
			throw new Error('End block token without start block token')
		}
		properties = blockToRestore.properties
		structures = blockToRestore.structures
		nextPropertyIndex = blockToRestore.nextPropertyIndex
		nextStructureIndex = blockToRestore.nextStructureIndex
		referenceableValues = blockToRestore.referenceableValues
	}

	function readIdentifiedValue() {
		var id = readOpen()
		var lastRead = offset
		try {
			assignValue(readOpen())
		} catch (error) {
			handlePossiblePause(error, {
				parser: parser,
				resume: function() {
					offset = lastRead
					return readOpen()
				},
				resumed: assignValue,
			})
		}

		function assignValue(value) {
			var target = referenceableValues[id]
			if (target) {
				if (typeof target === 'function') {
					target(value)
				} else {
					var hasProperties
					for (var key in target) {
						hasProperties = true
						break
					}
					if (!hasProperties) {
						unfulfilledReferences--
					}

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
	function read() {
		try {
			var lastRead = offset
			var result = readAsBlock()
			while (source.length > offset) {
				lastRead = offset
				readAsBlock() // keep reading through the blocks until we are finished with the input
			}
		} catch(error) {
			if (error.message == 'Unexpected end of dpack stream') {
				handlePossiblePause(error, {
					parser: parser,
					value: result,
					paused: function(value) {
						this.value = result = result || value
					},
					resume: function() {
						offset = lastRead
						return result
					},
					resumed: function() {
						var resumedResult = read()
						return result || resumedResult
					}
				})
			} else {
				error.message += ' at position ' + parser.getOffset() + ' of ' + source.length
				throw error
			}
		}
		return result
	}
	function passThrough(number) {
		return number
	}
	var readValue = readNext([
		function(number) {
			if (number == 0) {
				return null
			}
			return number
		},
		passThrough,
		readInlineString,
		passThrough
	])
	var parser = {
		setSource: function(string, startOffset) {
			source = string
			offset = startOffset || 0
			return this
		},
		hasMoreData: function() {
			return source.length > offset
		},
		hasUnfulfilledReferences: function() {
			return unfulfilledReferences > 0
		},
		getOffset: function() {
			return offset
		},
 		readValue: readValue,
		blocks: parentBlocks,
		read: read
	}
	return parser
}
exports.parse = function(stringOrBuffer, options) {
	var source
	if (typeof stringOrBuffer === 'string') {
		source = stringOrBuffer
	} else if (stringOrBuffer && stringOrBuffer.toString) {
		source = stringOrBuffer.toString(options && options.encoding || 'utf8')
	} else { // whatever (undefined or null or whatever), just return it
		return stringOrBuffer
	}
	var parser = createParser(options).setSource(source)
	return parser.read()
}
exports.parseLazy = function(buffer, parser) {
	return makeBlockFromBuffer(buffer, parser || createParser({
		lazy: true,
	}))
}
exports.createParser = createParser
var makeBlockFromBuffer = require('./Block').makeBlockFromBuffer
var bufferSymbol = require('./Block').bufferSymbol

var readMap = {
	fromArray: function(entries) {
		var map = new Map(entries)
		if (map.size == 0) {
			for (var i = 0, l = entries.length; i < l; i++) {
				var entry = entries[i]
				map.set(entry[0], entry[1])
			}
		}
		return map
	}
}
var readSet = {
	fromArray: function(values) {
		var set = new Set(values)
		if (set.size === 0 && values.length > 0) {
			for (var i = 0, l = values.length; i < l; i++) {
				set.add(values[i])
			}
		}
		return set
	}
}
var readDate = {
	fromArray: function(times) {
		return new Date(times[0])
	}
}

function handlePossiblePause(error, options) {
	if (error.message == 'Unexpected end of dpack stream') {
		var incomingValueInProgress = error.valueInProgress
		var parser = options.parser
		var incomingOnResume = parser.onResume
		if (incomingValueInProgress && options.paused) {
			options.paused(incomingValueInProgress)
		}
		error.valueInProgress = options.value
		parser.onResume = function(updatedString) {
			try {
				if (incomingOnResume) {
					// another resume operation starts
					incomingValueInProgress = incomingOnResume(updatedString)
				} else {
					// top of the resume stack
					parser.onResume = null
					parser.setSource(updatedString)
					incomingValueInProgress = options.resume()
				}
			} catch(error) {
				// if we rethrow before we get back finishing resuming
				handlePossiblePause(error, options)
			}
			return error.valueInProgress = options.resumed(incomingValueInProgress)
		}
	}
	throw error
}
