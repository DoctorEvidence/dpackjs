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
		this.waitingValues = []
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
				this.sendValue(value)
			} else {
				parser.setSource(sourceString)
			}
			while (sourceString) {
				value = parser.readOpen()
				parser.setSource(sourceString = sourceString.slice(parser.getOffset()))
				this.sendValue(value)
			}
		} catch(error) {
			if (error.message == 'Unexpected end of dpack stream') {
				this.lastChunk = sourceString.slice(lastRead)
			} else {
				console.error(error)
				value = error
			}
		}
		if (callback) callback()
	}
	sendValue(value) {
		if (this.parser.hasUnfulfilledReferences()) {
			if (value !== undefined) {
				this.waitingValues.push(value)
			}
		} else {
			while (this.waitingValues.length > 0) {
				this.push(this.waitingValues.shift())
			}
			if (value !== undefined) {
				this.push(value)
			}
		}
	}
}

exports.createParseStream = () => new DPackParseStream()
