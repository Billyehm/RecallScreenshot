package com.recallai.screenshots

import android.content.Context
import java.util.zip.GZIPInputStream

/** OpenAI CLIP byte-pair tokenizer used by MobileCLIP2's 77-token text tower. */
class ClipTokenizer(context: Context) {
  private val byteEncoder = bytesToUnicode()
  private val ranks: Map<Pair<String, String>, Int>
  private val encoder: Map<String, Int>
  private val cache = mutableMapOf<String, List<String>>()

  init {
    val merges = GZIPInputStream(context.assets.open(BPE_ASSET)).bufferedReader().useLines { lines ->
      lines.drop(1).take(MERGE_COUNT).map { line -> line.split(' ').let { it[0] to it[1] } }.toList()
    }
    ranks = merges.withIndex().associate { it.value to it.index }
    val vocabulary = byteEncoder.values.map(Char::toString).toMutableList()
    vocabulary += vocabulary.map { "$it</w>" }
    vocabulary += merges.map { (left, right) -> left + right }
    vocabulary += listOf(START, END)
    encoder = vocabulary.withIndex().associate { it.value to it.index }
  }

  fun encode(text: String): LongArray {
    val pieces = mutableListOf(encoder.getValue(START))
    TOKEN.findAll(clean(text)).forEach { match ->
      val encoded = match.value.encodeToByteArray().joinToString("") { byteEncoder.getValue(it.toInt() and 0xff).toString() }
      bpe(encoded).forEach { token -> encoder[token]?.let(pieces::add) }
    }
    pieces += encoder.getValue(END)
    val clipped = if (pieces.size <= CONTEXT_LENGTH) pieces else pieces.take(CONTEXT_LENGTH).toMutableList().also {
      it[CONTEXT_LENGTH - 1] = encoder.getValue(END)
    }
    return LongArray(CONTEXT_LENGTH) { index -> clipped.getOrElse(index) { 0 }.toLong() }
  }

  private fun bpe(token: String): List<String> = cache.getOrPut(token) {
    var word = token.dropLast(1).map(Char::toString) + "${token.last()}</w>"
    while (word.size > 1) {
      val pair = word.zipWithNext().minByOrNull { ranks[it] ?: Int.MAX_VALUE } ?: break
      if (pair !in ranks) break
      val merged = mutableListOf<String>()
      var index = 0
      while (index < word.size) {
        if (index < word.lastIndex && word[index] == pair.first && word[index + 1] == pair.second) {
          merged += pair.first + pair.second; index += 2
        } else {
          merged += word[index]; index += 1
        }
      }
      word = merged
    }
    word
  }

  private fun clean(value: String) = value.replace(WHITESPACE, " ").trim().lowercase()

  companion object {
    const val CONTEXT_LENGTH = 77
    const val START_TOKEN = 49406L
    const val END_TOKEN = 49407L
    private const val MERGE_COUNT = 48_894
    // Non-.gz extension prevents Android's asset merger from transparently expanding the file;
    // we stream the gzip ourselves and keep both APK size and tokenizer peak memory down.
    private const val BPE_ASSET = "mobileclip/bpe_simple_vocab_16e6.bpe"
    private const val START = "<start_of_text>"
    private const val END = "<end_of_text>"
    private val WHITESPACE = Regex("\\s+")
    private val TOKEN = Regex("'s|'t|'re|'ve|'m|'ll|'d|[\\p{L}]+|[\\p{N}]+|[^\\s\\p{L}\\p{N}]+")

    internal fun bytesToUnicode(): Map<Int, Char> {
      val bytes = ((33..126) + (161..172) + (174..255)).toMutableList()
      val codes = bytes.toMutableList()
      var extra = 0
      for (byte in 0..255) if (byte !in bytes) { bytes += byte; codes += 256 + extra++ }
      return bytes.indices.associate { bytes[it] to codes[it].toChar() }
    }
  }
}
