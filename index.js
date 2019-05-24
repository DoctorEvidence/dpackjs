/*
DPack - Fast, compact object structure encoding.
*/

exports.createSerializeStream = require('./lib/serialize-stream').createSerializeStream
exports.createParseStream = require('./lib/parse-stream').createParseStream
const serialize = require('./lib/serialize')
serialize.nodeCharEncoder = require('./lib/node-encoder').nodeCharEncoder
const parse = require('./lib/parse')
const Options = require('./lib/Options').Options

exports.serialize = serialize.serialize
exports.parse = parse.parse
exports.createSerializer = serialize.createSerializer
exports.createParser = parse.createParser
const Block = require('./lib/Block')
exports.parseLazy = Block.parseLazy
exports.asBlock = Block.asBlock
exports.isBlock = Block.isBlock
exports.copy = Block.copy
exports.reassignBuffers = Block.reassignBuffers
exports.Options = Options
exports.createSharedStructure = require('./lib/shared').createSharedStructure
