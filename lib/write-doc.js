const msgpack = require('msgpack-lite')
var getWriteType = require('msgpack-lite/lib/write-type').getWriteType
var getWriteToken = require('msgpack-lite/lib/write-token').getWriteToken
const bufferSymbol = Symbol('document')
const ENUM_TYPE = [] // marked with an empty array for now

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
	let lastReference = 0
	var structures = new Map()
	const lastReferencedStructures = new Array(16)
	var token = getWriteToken(options)
  	token[0xde] = write1(0xde)
  	token[0xdf] = write2(0xdf)
	var writeType = getWriteType(options)
	var baseObject = writeType.object

	writeType.object = function(encoder, object) {
		if (!object) {
			return baseEncode(encoder, null) // should inline this
		}
		const classHandler = classTypes[object.constructor.name]
		if (classHandler) {
			return classHandler(encoder, object)
		}
		const structure = []
		const structureIndices = []
		const values = []
		const startingPropertyLength = propertyIndex
		for (const key in object) {
			let property = properties.get(key)
			let value = object[key]
			const type = typeof value
			if (property) {
				let structureEntry = startingPropertyLength - property.index
				if (type === 'number') {
					if (property.strings) {
						// property is being used as a string enum, we can no longer interpret numbers as indices into property
						const asNumber = property.asNumber
						if (asNumber) {
							property = asNumber
							structureEntry = startingPropertyLength - property.index
						} else {
							property = property.asNumber = { index: propertyIndex++, key: key }
							structureEntry = key // make a new entry that is just the key
						}
					}
				} else if (!value || value === true) { // if we have enough of a simple primitive, make a fixed-value property
					const valueEntry = property[value] || (property[value] = { count: 0 })
					if (valueEntry.count++ > 20) { // start using a new fixed property index if a value is repeated enough
						if (valueEntry.propertyIndex === undefined) {
							valueEntry.propertyIndex = propertyIndex++
							valueEntry.key = key
							valueEntry.value = value
							structure.push({
								[structureEntry]: value
							})
						} else
							structure.push(startingPropertyLength - valueEntry.propertyIndex)
						structureIndices.push(valueEntry.propertyIndex)
						continue // don't add to values array in this case
					}
				} else if (type === 'string' && value.length > 1 && !property.hasNumbers) {
					// set string enums that we can referene
					let strings = property.strings
					if (!strings) {
						const asEnum = property.asEnum
						if (asEnum) {
							property = asEnum
							structureEntry = startingPropertyLength - property.index
						} else {
							property = property.asEnum = { index: propertyIndex++ }
							strings = property.strings = new Map()
							structureEntry = [key]
						}
					}
					const stringIndex = strings.get(value)
					if (stringIndex !== undefined) {
						// if we are in enum type mode, we can refer to (string) entries by number
						value = strings.size - stringIndex
					} else {
						strings.set(value, strings.size)
					}
				}
				structure.push(structureEntry)
			} else {
				properties.set(key, property = { index: propertyIndex, key: key })

				if (type === 'string') {
					const strings = property.strings = new Map()
					strings.set(value, 0)
					structure.push([key])
				} else {
					structure.push(key)
				}
				propertyIndex++
			}
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
				const type = 0x80 + structureRef
				token[type](encoder, type)
			} else {
				lastReferencedStructures[shortRef] = structureDefinition
				const type = (structureRef <= 0xFF) ? 0xde : 0xdf
				token[type](encoder, structureRef)
			}
		} else {
			structures.set(structureKey, structureDefinition = {
				index: structures.size
			})
			lastReferencedStructures[0] = structureDefinition
			// if the structure isn't defined, we inline it.
			token[0xc1](encoder, 0xc1)
			writeArray(encoder, structure)

		}
		return writeArrayElements(encoder, values)
	}
	const baseEncode = documentCodec.encode
	documentCodec.encode = function(encoder, value) {
		writeType[typeof value](encoder, value)
	}
	const classTypes = {
		Array: writeArray,
		Buffer: baseEncode
	}
	// TODO: add extensions
	return msgpack.encode(object, {
		codec: documentCodec,
	})

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
}

function write1(type) {
  return function(encoder, value) {
    var offset = encoder.reserve(2)
    var buffer = encoder.buffer
    buffer[offset++] = type
    buffer[offset] = value
  }
}

function write2(type) {
  return function(encoder, value) {
    var offset = encoder.reserve(3)
    var buffer = encoder.buffer
    buffer[offset++] = type
    buffer[offset++] = value >>> 8
    buffer[offset] = value
  }
}
//const main = require('..')
