const msgpack = require('msgpack-lite')
var getWriteType = require('msgpack-lite/lib/write-type').getWriteType
var getWriteToken = require('msgpack-lite/lib/write-token').getWriteToken
const bufferSymbol = Symbol('document')


const UNDEFINED = -23 // special marker for undefined slots that only uses one byte

exports.documentPacker = documentPacker
function documentPacker(object) {
	const buffer = object[bufferSymbol]
	if (buffer)
		return buffer
	var options = {}
	var documentCodec = msgpack.createCodec()
	var properties = new Map()
	var propertyIndex = 0
	var structureIndex = 0
	var nextStringIndex = 0
	var structures = new Map()
	var propertyArray = []
	var structureArray = []
	var singlePass = true
	const compression = options.compression || 1
	var token = getWriteToken(options)
	var writeType = getWriteType(options)
	var baseObject = writeType.object
	const curatedStructures = compression > 2
	const classTypes = {
	}

	writeType.object = function(encoder, object) {
		if (!object) {
			return baseEncode(encoder, null) // should inline this
		}
		const classHandler = classTypes[object.constructor.name]
		if (classHandler) {
			return classHandler(encoder, object)
		} else {
			const structure = []
			const values = []
			for (const key in object) {
				let property = properties.get(key)
				if (property) {
					//property.count++ // multi-pass
					structure.push(property.index)
				} else {
					properties.set(key, property = { index: propertyIndex, key: key })
					propertyArray.push(key)
					structure.push(propertyIndex)
					propertyIndex++
				}
				let value = object[key]
				if (typeof value === 'number') {
					if (property.enum) {
						// property is being used as a string enum, we can no longer interpret numbers as indices into property
						var asNumber = property.asNumber
						if (!asNumber) {
							property.asNumber = asNumber = { index: propertyIndex++, key: key }
							propertyArray.push(key)
						}
						structure[structure.length - 1] = asNumber.index
					} else if (!property.hasNumbers) {
						property.hasNumbers = true
					}
				} if (!value || value === true) { // if we have enough of a simple primitive, make a fixed-value property
					var valueEntry = property[value] || (property[value] = { count: 0 })
					if (valueEntry.count++ > 20) { // start using a new fixed property index if a value is repeated enough
						if (valueEntry.propertyIndex === undefined) {
							valueEntry.propertyIndex = propertyIndex++
							valueEntry.key = key
							valueEntry.value = value
							propertyArray.push([key, value])
						}
						structure[structure.length - 1] = valueEntry.propertyIndex
						continue // don't add to values array in this case
					}
				} else if (typeof value === 'string' && value.length > 1 && !property.hasNumbers) {
					// set string enums that we can referene
					const propertyValues = property.values || (property.values = new Map())
					const valueEntry = propertyValues.get(value)
					if (valueEntry) {
						// if we are in enum type mode, we can refer to (string) entries by number
						if (!property.enum) {
							propertyArray[property.index] = [key, property.enum = []]
						}
						if (valueEntry.index === undefined) {
							valueEntry.index = property.enum.push(value) - 1
						}
						value = valueEntry.index
					} else {
						propertyValues.set(value, stringEntry = {
							count: 1
						})
					}
				}
				// if property is enum, use enum index
				values.push(value)
			}
			const structureKey = String.fromCodePoint.apply(null, structure)
			// var structureKey = structure.join(',') // maybe safer?
			/* Is it faster to do?
			var structureEncoding = encode(structure) // reuse structureEncoding in encoding structures
			var structryKey = structureEncoding.toString('binary')
			*/
			let structureDef = structures.get(structureKey)
			let structureRef
			if (structureDef) {
				structureRef = structureDef.index
			} else {
				if (curatedStructures) {
					// if the structure isn't defined after an initial pass, we inline it.
					encoder.write(0xc1)
					const type = (structureRef < 16) ? (0x80 + structureRef) : (structureRef <= 0xFFFF) ? 0xde : 0xdf;
					token[type](encoder, structureRef)
					return writeArrayElements(encoder, values)
				} else {
					structures.set(structureKey, structureDef = { index: structureRef = structureIndex++, structure: structure })
					structureArray.push(structure)
				}
			}
			// use map token to reference the structure
			const type = (structureRef < 16) ? (0x80 + structureRef) : (structureRef <= 0xFFFF) ? 0xde : 0xdf;
			token[type](encoder, structureRef)
			return writeArrayElements(encoder, values)
		}
		return baseObject(encoder, object)
	}
	const baseEncode = documentCodec.encode
	documentCodec.encode = function(encoder, value) {
		writeType[typeof value](encoder, value)
	}
	if (compression > 1) {
		// if compression is greater than 1, do initial pass to find the most commonly used properties and structures
		initializeObject(object)
		propertyArray.sort(function(a, b) {
			return a.count > b.count ? 1 : -1
		})
		for (const i = 0, l = propertyArray.length; i < l; i++) {
			const property = propertyArray[i]
			if (property.propertyIndex) {
				propertyArray[i].propertyIndex = i
				propertyArray[i] = [property.key, property.value]
			} else {
				propertyArray[i].index = i
				propertyArray[i] = propertyArray.enum ?
					[propertyArray.key, propertyArray.enum] : propertyArray.key
			}
		}
		if (curatedStructures) {
			structureArray.sort(function(a, b) {
				return a.count > b.count ? 1 : -1
			})
			for (const i = 0, l = propertyArray.length; i < l; i++) {
				const structureDef = structureArray[i]
				structureDef.index = i
				structureArray[i] = structureDef.structure
			}
		}
	}
	classTypes.Array = writeArray
	classTypes.Buffer = baseEncode
	// TODO: add extensions
	var encodedObjectData = msgpack.encode(object, {
		codec: documentCodec,
	})
	nextProperty = 0
	nextStructure = 0
	function writeAvailable(promise) {
		if (promise) {
			promise.then(writeAvailable)
		}
		var buffer = Buffer.concat([msgpack.encode([
			nextProperty ? propertyArray.slice(nextProperty) : propertyArray,
			nextStructure ? structureArray.slice(nextStructure) : structureArray]), encodedObjectData])
		if (promise) {
			nextProperty = propertyArray.length
			nextStructure = structureArray.length
		}
		return buffer
	}
	return writeAvailable()

	function writeArray(encoder, array) {
		var length = array.length
		var type = (length < 16) ? (0x90 + length) : (length <= 0xFFFF) ? 0xdc : 0xdd
		token[type](encoder, length)
		return writeArrayElements(encoder, array)
	}
	function writeArrayElements(encoder, array) {
		var length = array.length
		for (var i = 0; i < length; i++) {
			var element = array[i]
			if (element && element.then) {
				encoder.writeBuffer(() => // wait for the stream to be ready again, this is our chance to wait on back-pressure
					element.then((value) => {
						writeArrayElements([value].concat(array.slice(i + 1)))
					}))
			}
			var promise = writeType[typeof element](encoder, element)
			if (promise) {
				return promise.then(() => {
					writeArrayElements(encoder, array.slice(i + 1)) // resume
				})
			}
		}
	}
	function initializeObject(object) {
		var className = object.constructor.name
		const classHandler = classTypes[className]
		if (classHandler) {
			return // could be extension
		} else if (className === 'Array') {
			for (const i = 0, l = object.length; i < l; i++) {
				const value = object[i]
				if (value && typeof value === 'object') {
					initializeObject(value)
				}
			}
		} else {
			const structure = curatedStructures ? [] : null
			for (const key in object) {
				let property = properties.get(key)
				if (property) {
					property.count++
				} else {
					properties.set(key, property = { count: 1, key: key })
				}
				if (structure)
					structure.push(property)
				let value = object[key]
				if (typeof value === 'number') {
					if (property.enum) {
						// property is being used as a string enum, we can no longer interpret numbers as indices into property
						var asNumber = property.asNumber
						if (!asNumber) {
							property.asNumber = asNumber = { index: propertyIndex++, key: key }
							propertyArray.push(key)
						}
						structure[structure.length - 1] = asNumber
					} else if (!property.hasNumbers) {
						property.hasNumbers = true
					}
				} if (!value || value === true) { // if we have enough of a simple primitive, make a fixed-value property
					var valueEntry = property[value] || (property[value] = { count: 0 })
					if (valueEntry.count++ > 20) { // start using a new fixed property index if a value is repeated enough
						if (valueEntry.propertyIndex === undefined) {
							valueEntry.propertyIndex = propertyIndex++
							valueEntry.key = key
							valueEntry.value = value
							propertyArray.push([key, value])
						}
						structure[structure.length - 1] = valueEntry
						continue // don't add to values array in this case
					}
				} else if (typeof value === 'string' && value.length > 1 && !property.hasNumbers) {
					// set string enums that we can referene
					const propertyValues = property.values || (property.values = new Map())
					const valueEntry = propertyValues.get(value)
					if (valueEntry) {
						// if we are in enum type mode, we can refer to (string) entries by number
						if (!property.enum) {
							propertyArray[property.index] = [key, property.enum = []]
						}
						if (valueEntry.index === undefined) {
							valueEntry.index = property.enum.push(value) - 1
						}
						value = valueEntry.index
					} else {
						propertyValues.set(value, stringEntry = {
							count: 1
						})
					}
				} else if (typeof value === 'object') {
					initializeObject(value)
				}
			}
			const structureKey = String.fromCodePoint.apply(null, structure)
			let structureDef = structures.get(structureKey)
			if (structureDef) {
				structureDef.count++
			} else {
				structures.set(structureKey, structureDef = { count: 1, structure: structure })
				structureArray.push(structure)
			}
		}
	}
}
//const main = require('..')
