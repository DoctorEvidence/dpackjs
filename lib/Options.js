function Options() {
	var writerByConstructor = this.writerByConstructor = new Map()
	writerByConstructor.set(Map, writeMap)
	writerByConstructor.set(Set, writeSet)
}
Options.prototype.addExtension = function(Class) {
	this.writerByConstructor.set(Class, writeExtendedClass)
}
exports.Options = Options
