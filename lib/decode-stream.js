const Transform = require('stream').Transform
const createDecoder = require('./decode').createDecoder
const DEFAULT_OPTIONS = {objectMode: true}

class DPackDecodeStream extends Transform {
  constructor(options) {
    if (options) {
      options.objectMode = true
    } else {
      options = DEFAULT_OPTIONS
    }
    super(options)
    this.decoder = createDecoder()
  }
  _transform(chunk, encoding, callback) {
    let value
    let sourceString = chunk.toString()
    this.decoder.setSource(sourceString)
    try {
      do {
        value = this.decoder.readOpen()
        if (value !== undefined)
          this.push(value)
      } while(this.decoder.hasMoreData)
    } catch(error) {
      console.error(error)
      value = error
    }
    if (callback) callback()
  }
}

exports.createDecodeStream = () => new DPackDecodeStream()
