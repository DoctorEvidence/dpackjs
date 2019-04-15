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
		try {
			var sourceString = chunk.toString()
			var parser = this.parser
			if (parser.onResume) {
				value = parser.onResume(sourceString, true)
				if (!parser.isPaused())
					this.sendValue(value)
			} else {
				parser.setSource(sourceString, 0, true)
			}
			while (parser.hasMoreData()) {
				value = parser.read()
				if (parser.isPaused())
					break
				else
					this.sendValue(value)
			}
		} catch (error) { // must catch errors here, and still call callback
			console.error(error)
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
