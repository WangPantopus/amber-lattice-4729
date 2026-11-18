@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.mailbox.cards.table

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.mailbox.CardExchange
import app.pantopus.android.data.api.models.mailbox.CardReplySummary
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.mailbox.CardRepliesRepository
import app.pantopus.android.data.mailbox.HolidayCardsRepository
import app.pantopus.android.ui.screens.mailbox.cards.takeLetters
import app.pantopus.android.ui.screens.mailbox.components.mailMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/** Writing back to a card on its table (plan Part 3): the joined card as read, and the reply being written or sent. */
data class CardReplyState(
    /** The card and its reply as the server joins them; null until read (and when it can't be read). */
    val exchange: CardExchange? = null,
    /** The sheet is up over the table. */
    val writing: Boolean = false,
    val message: String = "",
    val sending: Boolean = false,
    /** Why it didn't go, in the server's words. */
    val problem: String? = null,
    /** On its way: when it arrives, and whether it can still be taken back. */
    val sent: CardReplySummary? = null,
    val takingBack: Boolean = false,
)

/**
 * The reply to the card on this page (plan Part 3): reads the joined card (`GET /api/mailbox/cards/:id/exchange`),
 * sends the note with the saved signature and one request ID per draft (`POST …/reply`), and takes it back before the
 * pickup (`POST …/reply/take-back`). The server's `card_replies` decides whether "Write back" shows at all.
 */
@HiltViewModel
class CardReplyViewModel
    @Inject
    constructor(
        private val replies: CardRepliesRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow(CardReplyState())
        val state: StateFlow<CardReplyState> = _state.asStateFlow()

        private var cardId: String? = null
        private var requestId: String? = null

        /** Reads the joined card for [id] (once per card, and again after a send or take-back). */
        fun load(
            id: String,
            again: Boolean = false,
        ) {
            if (cardId == id && !again) return
            cardId = id
            viewModelScope.launch {
                val read = replies.exchange(id)
                if (read is NetworkResult.Success) _state.update { it.copy(exchange = read.data) }
            }
        }

        /** "Write back to {first name}": the sheet comes up. */
        fun open() {
            _state.update { it.copy(writing = true, problem = null) }
        }

        /** ✕ or Back: the sheet goes; what's written stays for the next time on this visit. */
        fun close() {
            _state.update { it.copy(writing = false, problem = null, sent = null) }
        }

        fun onMessage(text: String) {
            _state.update { it.copy(message = text.takeLetters(REPLY_LIMIT), problem = null) }
        }

        /** "Send with the morning mail": the note, the saved signature, and this draft's one request ID. */
        fun send() {
            val id = cardId ?: return
            val draft = _state.value
            if (draft.sending || draft.message.isBlank()) return
            val request = requestId ?: UUID.randomUUID().toString().also { requestId = it }
            val signature = HolidayCardsRepository.latest.value?.signature?.saved?.takeIf { it.drawable }
            _state.update { it.copy(sending = true, problem = null) }
            viewModelScope.launch {
                when (val result = replies.reply(id, draft.message.trim(), request, signature)) {
                    is NetworkResult.Success -> {
                        _state.update { it.copy(sending = false, sent = result.data) }
                        load(id, again = true)
                    }
                    is NetworkResult.Failure -> {
                        val why = result.error.mailMessage(online = true, doing = "send your reply")
                        _state.update { it.copy(sending = false, problem = why) }
                    }
                }
            }
        }

        /** Take it back before the pickup: the sheet comes back with the note on it, as a new draft. */
        fun takeBack() {
            val id = cardId ?: return
            if (_state.value.takingBack) return
            _state.update { it.copy(takingBack = true, problem = null) }
            viewModelScope.launch {
                when (val result = replies.takeBack(id)) {
                    is NetworkResult.Success -> {
                        requestId = null
                        _state.update { it.copy(takingBack = false, sent = null, writing = true) }
                        load(id, again = true)
                    }
                    is NetworkResult.Failure ->
                        _state.update {
                            it.copy(takingBack = false, problem = result.error.mailMessage(online = true, doing = "take your reply back"))
                        }
                }
            }
        }

        private companion object {
            /** "Keep your reply to 300 letters." */
            const val REPLY_LIMIT = 300
        }
    }
