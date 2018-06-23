const msgpack = require('msgpack-lite')
var getWriteType = require('msgpack-lite/lib/write-type').getWriteType
var getWriteToken = require('msgpack-lite/lib/write-token').getWriteToken
const bufferSymbol = Symbol('document')


const UNDEFINED = -23 // special marker for undefined slots that only uses one byte

function createCodec() {
	var codec = msgpack.createCodec()
	codec.addExtPacker(0x10, Document, documentPacker)
	codec.addExtUnpacker(0x10, documentUnpackerLazy)
	return codec
}
var codec = createCodec()
exports.codec = codec
var DEFAULT_OPTIONS = { codec: codec }
exports.createCodec = createCodec
let objectId = 1
function documentPacker(object) {
	const buffer = object[bufferSymbol]
	if (buffer)
		return buffer
	var options = {}
	var documentCodec = createCodec()
	var properties = new Map()
	var propertyIndex = 0
	var structureIndex = 0
	var nextStringIndex = 0
	var structures = new Map()
	var propertyArray = []
	var structureArray = []
	var singlePass = true
	var token = getWriteToken(options)
	var writeType = getWriteType(options)
	var baseObject = writeType.object

	writeType.object = function(encoder, object) {
		if (!object) {
			return baseEncode(encoder, null) // should inline this
		}
		if (object instanceof Array) {
			return writeArray(object)
		} else {
			var structure = []
			var values = []
			for (var key in object) {
				var property = properties.get(key)
				if (property) {
					//property.count++ // multi-pass
					structure.push(property.index)
				} else {
					properties.set(key, property = { count: 1, index: propertyIndex, key: key })
					propertyArray.push(key)
					structure.push(propertyIndex)
					propertyIndex++
				}
				var value = object[key]
				var isString
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
					var values = property.values || (property.values = new Map())
					var valueEntry = options.get(value)
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
						values.set(value, stringEntry = {
							count: 1
						})
					}
				}
				// if property is enum, use enum index
				values.push(value)
			}
			var structureKey = String.fromCodePoint.apply(null, structure)
			// var structureKey = structure.join(',') // maybe safer?
			/* Is it faster to do?
			var structureEncoding = encode(structure) // reuse structureEncoding in encoding structures
			var structryKey = structureEncoding.toString('binary')
			*/
			var structureDef = structures.get(structureKey)
			var structureRef
			if (structureDef) {
				structureRef = structureDef.index
			} else {
				structures.set(structureKey, structureDef = { index: structureRef = structureIndex++, structure: structure })
				structureArray.push(structure)
			}
			// use map token to reference the structure
			var type = (structureRef < 16) ? (0x80 + structureRef) : (structureRef <= 0xFFFF) ? 0xde : 0xdf;
			token[type](encoder, structureRef)
			return writeArrayElements(values)
		}
		return baseObject(encoder, object)
	}
	const baseEncode = documentCodec.encode
	documentCodec.encode = function(encoder, value) {
		writeType[typeof value](encoder, value)
	}

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
			nextProperty ? propertyArray.slice(nextProperty) : propertyArray
			nextStructure ? structureArray.slice(nextStructure) : structureArray]), encodedObjectData])
		if (promise) {
			nextProperty = propertyArray.length
			nextStructure = structureArray.length
		}
	}
	return writeAvailable()

	function writeArray(encoder, array) {
		var length = object.length
		var type = (length < 16) ? (0x80 + length) : (length <= 0xFFFF) ? 0xde : 0xdf
		token[type](encoder, length)
		return writeArrayElements(i, object)
	}
	function writeArrayElements(array) {
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
					writeArrayElements(array.slice(i + 1)) // resume
				})
			}
		}
	}
}
