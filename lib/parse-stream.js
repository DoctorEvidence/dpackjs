"use strict"
var Transform = require('stream').Transform
var createParser = require('./parse').createParser
var DEFAULT_OPTIONS = {objectMode: true}

class DPackParseStream extends Transform {
	constructor(options) {
		if (options) {
			options.objectMode = true
		} else {
			options = DEFAULT_OPTIONS
		}
		super(options)
		this.parser = createParser(options)
	}
	_transform(chunk, encoding, callback) {
		var value
		var sourceString = chunk.toString()
		var parser = this.parser
		var lastRead = 0
		try {
			if (this.lastChunk) {
				sourceString = this.lastChunk + sourceString
				this.lastChunk = null
			}
			if (parser.onResume) {
				value = parser.onResume(sourceString)
				parser.setSource(sourceString = sourceString.slice(parser.getOffset()))
				if (value !== undefined) {
					this.push(value)
				}
			} else {
				parser.setSource(sourceString)
			}
			while (sourceString) {
				value = parser.readOpen()
				parser.setSource(sourceString = sourceString.slice(parser.getOffset()))
				if (value !== undefined)
					this.push(value)
			}
		} catch(error) {
			if (error.message == 'BUFFER_SHORTAGE') {
				this.lastChunk = sourceString.slice(lastRead)
			} else {
				console.error(error)
				value = error
			}
		}
		if (callback) callback()
	}
}

exports.createParseStream = () => new DPackParseStream()
