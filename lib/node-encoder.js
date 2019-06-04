var PREFERRED_MAX_BUFFER_SIZE = 0x8000
function nodeCharEncoder(options) {
	var offset = options.startOffset || 0
	var bufferSize = (offset >> 6 << 6) + 0x300
	var outlet = options.outlet
	var buffer = Buffer.allocUnsafe(bufferSize)
	var encoding = options.encoding
	var sequences = []
	function makeRoom(bytesNeeded) {
		if (outlet) {
			outlet.writeBytes(buffer.slice(0, offset))
			if (bufferSize < PREFERRED_MAX_BUFFER_SIZE || bytesNeeded > PREFERRED_MAX_BUFFER_SIZE) {
				bufferSize = Math.max(bufferSize * 2, bytesNeeded)
			}
			buffer = Buffer.allocUnsafe(bufferSize)
			offset = 0
			sequences = [] // clear insertion points
		} else {
			bufferSize = Math.max(bufferSize * 2, bufferSize + bytesNeeded)
			var oldBuffer = buffer
			buffer = Buffer.allocUnsafe(bufferSize)
			oldBuffer.copy(buffer, 0, 0, offset)
		}
	}
	function flush(specifiedOutlet) {
		(specifiedOutlet || outlet).writeBytes(buffer.slice(0, offset))
		//if (offset + 2000 > buffer.length)
		buffer = Buffer.allocUnsafe(bufferSize = Math.min(Math.max(offset, 0x100), 0x8000)) // allocate a new buffer, don't want to overwrite the bytes in the old one while they are in use!
		/*else {// or continue to use the remaining space in this buffer, if there is a lot of room left
			buffer = buffer.slice(offset)
			end = buffer.length
		}*/
		offset = 0
		sequences = [] // clear insertion points
	}
	function writeToken(type, number) {
		if (number < 0x10) { // 4 bits of number
			buffer[offset++] = ((type << 4) + number) ^ 0x40
		} else if (number < 0x400) { // 10 bits of number
			buffer[offset++] = (type << 4) + (number >>> 6)
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x10000) { // 16 bits of number
			buffer[offset++] = (type << 4) + (number >>> 12)
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x400000) { // 22 bits of number
			buffer[offset++] = (type << 4) + (number >>> 18)
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x10000000) { // 28 bits of number
			buffer[offset++] = (type << 4) + (number >>> 24)
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x100000000) { // 32 bits of number
			buffer[offset++] = (type << 4) + (number >>> 30)
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x400000000) { // 34 bits of number
			buffer[offset++] = (type << 4) + (number / 0x40000000 >>> 0)
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x10000000000) { // 40 bits of number
			buffer[offset++] = (type << 4) + (number / 0x1000000000 >>> 0)
			buffer[offset++] = (number / 0x40000000) & 0x3f
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else if (number < 0x400000000000) { // 46 bits of number (needed for dates!)
			buffer[offset++] = (type << 4) + (number / 0x40000000000 >>> 0)
			buffer[offset++] = (number / 0x1000000000) & 0x3f
			buffer[offset++] = (number / 0x40000000) & 0x3f
			buffer[offset++] = (number >>> 24) & 0x3f
			buffer[offset++] = (number >>> 18) & 0x3f
			buffer[offset++] = (number >>> 12) & 0x3f
			buffer[offset++] = (number >>> 6) & 0x3f
			buffer[offset++] = (number & 0x3f) + 0x40
		} else {
			throw new Error('Invalid number ' + number)
		}
		if (offset > bufferSize - 10) {
			makeRoom(0)
		}
	}

	function writeBuffer(source) {
		var sourceLength = source.length
		if (sourceLength + offset + 10 > bufferSize) {
			makeRoom(sourceLength + 10)
		}
		source.copy(buffer, offset)
		offset += sourceLength
	}

	function writeString(string) {
		var length = string.length
		var maxStringLength = length * 3 + 10
		if (offset + maxStringLength > bufferSize) {
			makeRoom(maxStringLength + 10)
		}
		var bytesWritten = encoding ? buffer.write(string, offset, buffer.length, encoding) :
			buffer.utf8Write(string, offset, buffer.length)
		offset += bytesWritten
	}
	function getSerialized() {
		return buffer.slice(0, offset)
	}
	function insertBuffer(headerBuffer, position) {
		var headerLength = headerBuffer.length
		if (offset + headerLength + 10 > bufferSize) {
			makeRoom(headerLength + 10)
		}
		buffer.copy(buffer, headerLength + position, position, offset)
		headerBuffer.copy(buffer, position)
		offset += headerLength
	}

	var encoder = {
		writeToken,
		writeString,
		writeBuffer,
		getSerialized,
		insertBuffer,
		flush,
		startSequence() {
			var currentOffset = offset
			buffer[offset++] = 60
			sequences.push(currentOffset)
			if (offset > bufferSize - 10) {
				makeRoom(0)
			}
		},
		endSequence(length) {
			var startOffset = sequences.pop()
			if (length < 12 && startOffset > -1) { // if it is short enough, and hasn't been cleared, we can set the beginning byte length
				buffer[startOffset] = 48 + length
				return
			}
			buffer[offset++] = 62 // else we need to put an end sequence token in
		},
		getOffset() {
			return offset
		},
		setOffset(newOffset) {
			offset = newOffset
		}
	}
	if (false) {
		global.typeCount = []
		encoder.writeToken = function(type, number) {
			typeCount[type] = (typeCount[type] || 0) + 1
			writeToken(type, number)
		}
		global.stringCount = new Map()
		encoder.writeString = function(string) {
			stringCount.set(string, (stringCount.get(string) || 0) + 1)
			writeString(string)
		}
		setTimeout(function() {
			var stringDuplicationCount = 0
			console.log('stringCount', Array.from(stringCount).filter(([string, count]) => {
				if (count > 1 & string.length > 3) {
					stringDuplicationCount += (count - 1) * string.length
					return true
				}
			}))
			console.log('stringDuplicationCount', stringDuplicationCount)
			console.log('typeCount', typeCount)
		})
	}
	return encoder
}
exports.nodeCharEncoder = nodeCharEncoder
