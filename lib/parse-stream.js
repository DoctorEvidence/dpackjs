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
    this.parser = createParser()
  }
  _transform(chunk, encoding, callback) {
    var value
    var sourceString = chunk.toString()
    this.parser.setSource(sourceString)
    try {
      do {
        value = this.parser.readOpen()
        if (value !== undefined)
          this.push(value)
      } while(this.parser.hasMoreData())
    } catch(error) {
      console.error(error)
      value = error
    }
    if (callback) callback()
  }
}

exports.createParseStream = () => new DPackParseStream()
