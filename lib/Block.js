const { encode } = require('./encode')
const bufferSymbol = Symbol('buffer')

function Block() {}
exports.Block = Block
exports.bufferSymbol = bufferSymbol
exports.makeBlock = function(object) {
	return new Proxy({
		decoded: object
	}, binaryMapped)
}
exports.makeBlockFromBuffer = function(buffer, decoder) {
	return new Proxy({
		buffer: buffer,
		decoder: decoder
	}, binaryMapped)
}

const binaryMapped = {
	get(target, key) {
		if (key === 'constructor')
			return Block
		if (key === bufferSymbol) {
			return target.buffer || getEncoded(target)
		}
		var decoded = target.decoded
		if (!decoded) {
			decoded = getDecoded(target)
		}
		return decoded[key]
	},
	set(target, key, value) {
		var decoded = target.decoded
		if (!decoded) {
			decoded = getDecoded(target)
		}
		// invalidate the buffer, it is no longer a valid representation
		this.buffer = null
		this.decoder = null
		decoded[key] = value
		return true
	},
	getOwnPropertyDescriptor(target, key) {
		var decoded = getDecoded(target)
		return Object.getOwnPropertyDescriptor(decoded, key)
	},
	has(target, key) {
		var decoded = getDecoded(target)
		return key in decoded
	},
	ownKeys(target) {
		var decoded = getDecoded(target)
		return Object.keys(decoded)
	}

}
function getDecoded(target) {
	var decoded = target.decoded
	if (decoded)
		return decoded
	var buffer = target.buffer
	var decoder = target.decoder
	var primaryBuffer
	var firstByte = buffer[0]
	if (firstByte === 0x4b) {
		var referenceableValues = decoder.referenceableValues
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
				referenceableValues[id] = new Proxy({
					buffer: nextBuffer,
					decoder: decoder
				})
			}
		}
	} else {
		primaryBuffer = buffer
	}
	return target.decoded = decoder.setSource(primaryBuffer.toString(), 0).readOpen()
}

function getEncoded(target) {
	return target.buffer = encode(target.decoded)
}
