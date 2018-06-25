var getReadToken = require('msgpack-lite/lib/read-token').getReadToken
var readFormat = require('msgpack-lite/lib/read-format')
var readUint8 = readFormat.readUint8
var uint16 = readFormat.uint16
var uint32 = readFormat.uint32
var DecodeBuffer = require('msgpack-lite/lib/decode-buffer').DecodeBuffer
var createCodec = require('msgpack-lite').createCodec

exports.documentUnpackerLazy = documentUnpackerLazy
function documentUnpackerLazy(buffer) {
	return new Proxy({ buffer: buffer }, unpackOnDemand)
}
const unpackOnDemand = {
	get(target, key) {
		var decoded = target.decodedMsgPack
		if (!decoded) {
			if (key == 'constructor')
				return new Document(target)
			decoded = unpackOnDemand.getDecoded(target)
		}
		return decoded[key]
	},
	set(target, key, value) {

	},
	getOwnPropertyDescriptor(target, key) {
		var decoded = unpackOnDemand.getDecoded(target)
		return Object.getOwnPropertyDescriptor(decoded, key)
	},
	has(target, key) {
		var decoded = unpackOnDemand.getDecoded(target)
		return key in decoded
	},
	getDecoded(target) {
		var decoded = target.decodedMsgPack
		if (decoded)
			return decoded
		return target.decodedMsgPack = documentUnpacker(target.buffer)
	},
	ownKeys(target) {
		var decoded = unpackOnDemand.getDecoded(target)
		return Object.keys(decoded)
	}
}

function documentUnpacker(buffer) {
	var documentCodec = createCodec()
	var readToken = getReadToken(options)
	// fixmap -- 0x80 - 0x8f
	for (var i = 0x80; i <= 0x8f; i++) {
		readToken[i] = fix(i - 0x80, map)
	}
	readToken[0xde] = flex(uint16, map)
	readToken[0xdf] = flex(uint32, map)
	function map(decoder, structureRef, startingObject) {
		var value, object = startingObject || {}
		var structure = structures[structureRef]
		var lastRead
		try {
			for (var i = 0, l = structure.length; i < l; i++) {
				lastRead = decoder.offset
				var property = properties[structure[i]]
				if (typeof property === 'string') {
					value = decode(decoder)
				} else {
					var type = property[1]
					property = property[0]
					if (type && type.length) { // enum
						value = decode(decoder)
						if (typeof value === 'number') {
							// it is a reference to an enum
							value = type[value]
						}
					} else { // fixed value
						value = type
					}
				}
				object[property] = value
			}
		} catch (error) {
			if (error.message == 'BUFFER_SHORTAGE') {
				if (error.valueInProgress !== undefined) {
					object[property] = error.valueInProgress
				}
				error.valueInProgress = object
				if (!error.whenResumed) {
					error.whenResumed = new Promise(function(resolve, reject) {
						decoder.onResume = function(buffer) {
							// received more buffer, can continue
							decoder.buffer = buffer
							decoder.offset = lastRead
							resolve()
						}
					})
				}

				error.whenResumed = error.whenResumed.then(function() {
					return map(decoder, structureRef, object)
				})
			}
			throw error
		}
		return object
	}
	const baseDecode = documentCodec.decode
	documentCodec.decode = decode
	function decode(decoder) {
		var type = readUint8(decoder)
		var func = readToken[type]
		if (!func) throw new Error('Invalid type: ' + (type ? ('0x' + type.toString(16)) : type));
		return func(decoder)
	}
	var options = {
		codec: documentCodec
	}
	var decoder = new DecodeBuffer({
		codec: documentCodec
	})
	decoder.write(buffer)
	var declarations = decoder.read() // read the declarations
	var properties = declarations[0]
	var structures = declarations[1]
	return decoder.read() // now read the root object
}

exports.encode = (value, options) => {
	if (options) {
		if (!options.codec) {
			options.codec = codec
		}
	} else {
		options = DEFAULT_OPTIONS
	}
	return msgpack.encode(value, options)
}

exports.decode = (value, options) => {
	if (options) {
		if (!options.codec) {
			options.codec = codec
		}
	} else {
		options = DEFAULT_OPTIONS
	}
	return msgpack.decode(value, options)
}


function ext(decoder, len) {
	var partialBuffer = (len+1 + this.offset > this.buffer.length)
	var start = decoder.reserve(partialBuffer ? this.buffer.length - this.offset : decoder.reserve(len+1))
	var type = decoder.buffer[start++]
	var end = start + len
	var unpack = decoder.codec.getExtUnpacker(type)
	if (!unpack) throw new Error("Invalid ext type: " + (type ? ("0x" + type.toString(16)) : type))
	var buf = BufferProto.slice.call(decoder.buffer, start, end)
	if (partialBuffer) {
		if (unpack.allowPartial) {
			try {
				return unpack(buf) // should throw buffer shortage error
			} catch (error) {
				if (error.message == 'BUFFER_SHORTAGE') {
					var previousOnResume = decoder.onResume
					decoder.onResume = function(buffer) {
						ext(decoder, len)
						previousOnResume(buffer.slice(start, end))
					}
				}
				throw error
			}
		} else {
			throw new Error('BUFFER_SHORTAGE')
		}
	}
	return unpack(buf)
}

function flex(lenFunc, decodeFunc) {
	return function(decoder) {
		var len = lenFunc(decoder)
		return decodeFunc(decoder, len)
	};
}

function fix(len, method) {
	return function(decoder) {
		return method(decoder, len)
	}
}
