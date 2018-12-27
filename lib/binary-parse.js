"use strict"
function createParser(options) {
	var source
	var offset = 0
	return {
		setSource: function(buffer, newOffset) {
			source = buffer
			offset = newOffset || 0
		},
		getOffset: function() {
			return offset
		},
		readValue: function() {
			var type, number
			var token = source[offset++]
			if (token >= 0x40) { // fast path for one byte with stop bit
				if (token > 0x4000) { // long-token handling
					type = (token >>> 12) & 3
					number = token & 0xfff
				} else {
					type = (token >>> 4) & 3
					number = token & 0xf
				}
			} else {
				type = (token >>> 4) & 11 // shift and omit the stop bit (bit 3)
				number = token & 0xf
				token = source[offset++]
				number = (number << 6) + (token & 0x3f) // 10 bit number
				if (!(token >= 0x40)) {
					token = source[offset++]
					number = (number << 6) + (token & 0x3f) // 16 bit number
					if (!(token >= 0x40)) {
						token = source[offset++]
						number = (number << 6) + (token & 0x3f) // 22 bit number
						if (!(token >= 0x40)) {
							token = source[offset++]
							number = (number << 6) + (token & 0x3f) // 28 bit number
							if (!(token >= 0x40)) {
								token = source[offset++]
								number = (number * 0x40) + (token & 0x3f) // 34 bit number (we can't use 32-bit shifting operators anymore)
								if (!(token >= 0x40)) {
									token = source[offset++]
									number = (number * 0x40) + (token & 0x3f) // 40 bit number
									if (!(token >= 0x40)) {
										token = source[offset++]
										number = (number * 0x40) + (token & 0x3f) // 46 bit number, we don't go beyond this
										if (!(token >= 0)) {
											if (offset > source.length) {
												throw new Error('Unexpected end of dpack stream')
											}
										}
									}
								}
							}
						}
					}
				}
			}
			return {
				type: type,
				number: number
			}
		}
	}
}
exports.createParser = createParser
