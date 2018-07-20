/*
DPack - Fast, compact object structure encoding.
*/

exports.createSerializeStream = require('./lib/serialize-stream').createSerializeStream
exports.createParseStream = require('./lib/parse-stream').createParseStream
const serialize = require('./lib/serialize')
const parse = require('./lib/parse')

exports.serialize = serialize.serialize
exports.parse = parse.parse
exports.createSerializer = serialize.createSerializer
exports.createParser = parse.createParser
exports.parseLazy = parse.parseLazy
exports.asBlock = require('./lib/Block').asBlock
