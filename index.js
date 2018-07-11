/*
DPack - Fast, compact object structure encoding.
*/

exports.createEncodeStream = require('./lib/encode-stream').createEncodeStream
exports.createDecodeStream = require('./lib/decode-stream').createDecodeStream
const encode = require('./lib/encode')
const decode = require('./lib/decode')

exports.encode = encode.encode
exports.decode = decode.decode
exports.createEncoder = encode.createEncoder
exports.createDecoder = decode.createDecoder
exports.decodeLazy = decode.decodeLazy
exports.makeBlock = require('./lib/Block').makeBlock
