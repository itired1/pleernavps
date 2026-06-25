package com.itired.music

import android.content.res.AssetManager
import fi.iki.elonen.NanoHTTPD
import java.io.InputStream
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

class LocalServer(port: Int, private val assets: AssetManager) : NanoHTTPD(port) {

    // ==================== MODELS ====================
    data class User(val id: Int, val username: String, val email: String, val passwordHash: String,
                    var displayName: String = username, var bio: String = "", var avatarUrl: String = "",
                    var avatarEmoji: String = "🎵", var currentSource: String = "yandex",
                    var discordWebhook: String = "", var discordEnabled: Boolean = false,
                    var isAdmin: Boolean = false, var balance: Int = 0,
                    var theme: String = "dark", var language: String = "ru",
                    var autoPlay: Boolean = true, var musicService: String = "yandex",
                    var equippedBadge: String = "", var equippedFrame: String = "",
                    var createdAt: Long = System.currentTimeMillis(),
                    var lastSeen: Long = System.currentTimeMillis())

    data class Session(val token: String, val userId: Int, val createdAt: Long = System.currentTimeMillis())
    data class Playlist(val id: Int, val userId: Int, var title: String, var description: String = "",
                        var coverUrl: String = "", var isPublic: Boolean = true,
                        var createdAt: Long = System.currentTimeMillis(),
                        var updatedAt: Long = System.currentTimeMillis())
    data class PlaylistTrack(val id: Int, val playlistId: Int, val trackId: String, var trackData: String = "{}",
                             var position: Int = 0, val addedAt: Long = System.currentTimeMillis())
    data class LikedTrack(val id: Int, val userId: Int, val trackId: String, var trackData: String = "{}",
                          val likedAt: Long = System.currentTimeMillis())
    data class ListeningHistory(val id: Int, val userId: Int, val trackId: String,
                                var trackData: String = "{}", var artistName: String = "",
                                var durationSeconds: Int = 0, val playedAt: Long = System.currentTimeMillis())
    data class SavedQueue(val id: Int, val userId: Int, var name: String = "Queue",
                          var tracksData: String = "[]",
                          val createdAt: Long = System.currentTimeMillis(),
                          var updatedAt: Long = System.currentTimeMillis())
    data class Friend(val id: Int, val userId: Int, val friendId: Int, var status: String = "pending",
                      var tasteMatch: Int = 0, val createdAt: Long = System.currentTimeMillis())
    data class UserActivity(val id: Int, val userId: Int, val activityType: String,
                            var activityData: String = "{}", val createdAt: Long = System.currentTimeMillis())
    data class Notification(val id: Int, val userId: Int, val type: String, val message: String,
                            var data: String = "{}", var read: Boolean = false,
                            val createdAt: Long = System.currentTimeMillis())

    // Battle Pass
    data class BpSeason(val id: Int, val name: String, val startDate: Long, val endDate: Long,
                        val maxLevel: Int = 50, var isActive: Boolean = true,
                        val createdAt: Long = System.currentTimeMillis())
    data class BpLevel(val id: Int, val seasonId: Int, val level: Int, val xpRequired: Int,
                       val freeReward: String = "{}", val premiumReward: String = "{}")
    data class UserBp(val id: Int, val userId: Int, val seasonId: Int, var level: Int = 1,
                      var xp: Int = 0, var hasPremium: Boolean = false,
                      var claimedFree: String = "[]", var claimedPremium: String = "[]",
                      var lastDailyBonus: Long = 0, val createdAt: Long = System.currentTimeMillis())
    data class BpQuest(val id: Int, val seasonId: Int, val type: String, val description: String,
                       val xpReward: Int, val reqType: String, val reqValue: Int = 1,
                       var isActive: Boolean = true, val createdAt: Long = System.currentTimeMillis())
    data class UserQuest(val id: Int, val userId: Int, val questId: Int, var progress: Int = 0,
                         var completed: Boolean = false, var claimed: Boolean = false,
                         val assignedDate: Long = System.currentTimeMillis())

    // Shop
    data class ShopItem(val id: Int, val name: String, val type: String, val category: String = "general",
                        val price: Int, val data: String = "{}", val rarity: String = "common",
                        var isActive: Boolean = true)
    data class UserInventory(val id: Int, val userId: Int, val itemId: String, val itemType: String = "",
                             val data: String = "{}", val purchasedAt: Long = System.currentTimeMillis(),
                             var equipped: Boolean = false)
    data class CurrencyTx(val id: Int, val userId: Int, val amount: Int, val reason: String = "",
                          val createdAt: Long = System.currentTimeMillis())

    // ==================== STORAGE ====================
    private val users = ConcurrentHashMap<Int, User>()
    private val sessions = ConcurrentHashMap<String, Session>()
    private val usernames = ConcurrentHashMap<String, Int>()
    private val emails = ConcurrentHashMap<String, Int>()
    private val playlists = ConcurrentHashMap<Int, Playlist>()
    private val playlistTracks = ConcurrentHashMap<Int, MutableList<PlaylistTrack>>()
    private val likedTracks = ConcurrentHashMap<Int, MutableList<LikedTrack>>()
    private val listeningHistory = ConcurrentHashMap<Int, MutableList<ListeningHistory>>()
    private val savedQueues = ConcurrentHashMap<Int, MutableList<SavedQueue>>()
    private val friends = ConcurrentHashMap<Int, MutableList<Friend>>()
    private val activities = ConcurrentHashMap<Int, MutableList<UserActivity>>()
    private val notifications = ConcurrentHashMap<Int, MutableList<Notification>>()

    private var nextUserId = 1
    private var nextPlaylistId = 1
    private var nextTrackId = 100
    private var nextLikedId = 1
    private var nextHistoryId = 1
    private var nextQueueId = 1
    private var nextFriendId = 1
    private var nextActivityId = 1
    private var nextNotifId = 1
    private var nextBpSeasonId = 1
    private var nextBpLevelId = 1
    private var nextBpUserId = 1
    private var nextBpQuestId = 1
    private var nextUserQuestId = 1
    private var nextShopItemId = 1
    private var nextInvId = 1
    private var nextTxId = 1

    private val bpSeasons = ConcurrentHashMap<Int, BpSeason>()
    private val bpLevels = ConcurrentHashMap<Int, MutableList<BpLevel>>()
    private val userBps = ConcurrentHashMap<Int, MutableList<UserBp>>()
    private val bpQuests = ConcurrentHashMap<Int, MutableList<BpQuest>>()
    private val userQuests = ConcurrentHashMap<Int, MutableList<UserQuest>>()
    private val shopItems = ConcurrentHashMap<Int, ShopItem>()
    private val inventory = ConcurrentHashMap<Int, MutableList<UserInventory>>()
    private val currencyTx = ConcurrentHashMap<Int, MutableList<CurrencyTx>>()

    private val recentTracks = listOf(
        mapOf("id" to "yandex_1", "title" to "Blinding Lights", "artist" to "The Weeknd", "cover" to "#e17055", "emoji" to "🎵", "duration" to 203, "album" to "After Hours"),
        mapOf("id" to "yandex_2", "title" to "Shape of You", "artist" to "Ed Sheeran", "cover" to "#00b894", "emoji" to "🎤", "duration" to 233, "album" to "÷ (Divide)"),
        mapOf("id" to "yandex_3", "title" to "Bohemian Rhapsody", "artist" to "Queen", "cover" to "#6c5ce7", "emoji" to "🎸", "duration" to 354, "album" to "A Night at the Opera"),
        mapOf("id" to "yandex_4", "title" to "Stairway to Heaven", "artist" to "Led Zeppelin", "cover" to "#0984e3", "emoji" to "🎸", "duration" to 482, "album" to "Led Zeppelin IV"),
        mapOf("id" to "yandex_5", "title" to "Imagine", "artist" to "John Lennon", "cover" to "#e17055", "emoji" to "🎹", "duration" to 187, "album" to "Imagine"),
        mapOf("id" to "yandex_6", "title" to "Smells Like Teen Spirit", "artist" to "Nirvana", "cover" to "#e84393", "emoji" to "🎸", "duration" to 301, "album" to "Nevermind"),
        mapOf("id" to "yandex_7", "title" to "Hotel California", "artist" to "Eagles", "cover" to "#fdcb6e", "emoji" to "🎸", "duration" to 391, "album" to "Hotel California"),
        mapOf("id" to "yandex_8", "title" to "Billie Jean", "artist" to "Michael Jackson", "cover" to "#00b894", "emoji" to "🎤", "duration" to 294, "album" to "Thriller"),
        mapOf("id" to "yandex_9", "title" to "Yesterday", "artist" to "The Beatles", "cover" to "#6c5ce7", "emoji" to "🎹", "duration" to 125, "album" to "Help!"),
        mapOf("id" to "yandex_10", "title" to "Rolling in the Deep", "artist" to "Adele", "cover" to "#e17055", "emoji" to "🎤", "duration" to 228, "album" to "21"),
    )

    private val allTracks: List<Map<String, Any>> get() = recentTracks

    init {
        createUser("guest", "guest@itired.app", "guest", "Guest")
        // Seed some playlists for guest
        val pl1 = createPlaylist(1, "Chill Vibes", "Relax and unwind", "#6c5ce7")
        addTrackToPlaylist(pl1.id, "yandex_1", """{"title":"Blinding Lights","artist":"The Weeknd","cover":"#e17055","emoji":"🎵"}""")
        addTrackToPlaylist(pl1.id, "yandex_5", """{"title":"Imagine","artist":"John Lennon","cover":"#e17055","emoji":"🎹"}""")
        addTrackToPlaylist(pl1.id, "yandex_9", """{"title":"Yesterday","artist":"The Beatles","cover":"#6c5ce7","emoji":"🎹"}""")
        val pl2 = createPlaylist(1, "Workout Energy", "Power through", "#e17055")
        addTrackToPlaylist(pl2.id, "yandex_2", """{"title":"Shape of You","artist":"Ed Sheeran","cover":"#00b894","emoji":"🎤"}""")
        addTrackToPlaylist(pl2.id, "yandex_6", """{"title":"Smells Like Teen Spirit","artist":"Nirvana","cover":"#e84393","emoji":"🎸"}""")
        addTrackToPlaylist(pl2.id, "yandex_4", """{"title":"Stairway to Heaven","artist":"Led Zeppelin","cover":"#0984e3","emoji":"🎸"}""")
        // Seed shop
        listOf(
            ShopItem(1, "Dark Theme", "theme", "visual", 500, """{"colors":"dark"}""", "common"),
            ShopItem(2, "Neon Theme", "theme", "visual", 1200, """{"colors":"neon"}""", "rare"),
            ShopItem(3, "Gold Badge", "badge", "accessories", 800, """{"icon":"🥇"}""", "rare"),
            ShopItem(4, "Music Frame", "frame", "accessories", 600, """{"color":"#6c5ce7"}""", "common"),
            ShopItem(5, "Diamond Badge", "badge", "accessories", 2000, """{"icon":"💎"}""", "legendary"),
            ShopItem(6, "Purple Banner", "banner", "visual", 300, """{"color":"#6c5ce7"}""", "common"),
        ).forEach { shopItems[it.id] = it }
        nextShopItemId = 7
        // Seed battle pass season
        val season = BpSeason(1, "Season 1: Launch", System.currentTimeMillis(),
            System.currentTimeMillis() + 604800000L * 12, 50)
        bpSeasons[1] = season
        val levels = mutableListOf<BpLevel>()
        for (i in 1..50) {
            levels.add(BpLevel(i, 1, i, i * 100,
                """{"coins":${i * 10}}""",
                """{"coins":${i * 20},"item":"theme_${i}"}"""))
        }
        bpLevels[1] = levels
        // Seed quests
        listOf(
            BpQuest(1, 1, "daily", "Listen to 3 tracks", 50, "listen_count", 3),
            BpQuest(2, 1, "daily", "Like 1 track", 30, "like_tracks", 1),
            BpQuest(3, 1, "daily", "Play 10 minutes", 60, "listen_minutes", 10),
            BpQuest(4, 1, "weekly", "Create 2 playlists", 200, "playlists_created", 2),
            BpQuest(5, 1, "weekly", "Listen to 30 tracks", 300, "listen_count", 30),
            BpQuest(6, 1, "weekly", "Add 5 tracks to favorites", 250, "like_tracks", 5),
        ).forEach { bpQuests.getOrPut(1) { mutableListOf() }.add(it) }
        nextBpQuestId = 7
    }

    // ==================== HELPERS ====================
    private fun hashPassword(pw: String): String =
        MessageDigest.getInstance("SHA-256").digest(pw.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun generateToken(): String {
        val random = SecureRandom()
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun getSession(s: IHTTPSession): Session? {
        val raw = s.headers["x-session-token"]
            ?: s.cookies.read("session")
            ?: s.headers["cookie"]?.split(";")?.map { it.trim() }
                ?.find { it.startsWith("session=") }?.removePrefix("session=")
            ?: return null
        return sessions[raw]
    }

    private fun requireUser(s: IHTTPSession): User? {
        val sess = getSession(s) ?: return null
        return users[sess.userId]
    }

    private fun requireUserResp(s: IHTTPSession): Response? {
        return if (requireUser(s) == null) jsonResp(mapOf("error" to "unauthorized"), 401) else null
    }

    private fun setCookie(r: Response, token: String) {
        r.addHeader("Set-Cookie", "session=$token; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000")
    }

    private fun trackToMap(t: Map<String, Any>) = mapOf(
        "id" to t["id"], "title" to t["title"], "artist" to t["artist"],
        "cover" to t["cover"], "emoji" to t["emoji"], "duration" to t["duration"], "album" to (t["album"] ?: "")
    )

    // ==================== SERVE ====================
    override fun serve(s: IHTTPSession): Response {
        val uri = s.uri.trimEnd('/').ifEmpty { "/index.html" }
        val method = s.method
        return try {
            when {
                // === AUTH ===
                uri == "/api/auth/register" && method == Method.POST -> registerApi(s)
                uri == "/api/auth/login" && method == Method.POST -> loginApi(s)
                uri == "/api/auth/logout" && method == Method.POST -> logoutApi(s)
                uri == "/api/auth/me" -> meApi(s)

                // === HEALTH ===
                uri == "/api/health" -> jsonResp(healthData())

                // === TRACKS ===
                uri == "/api/tracks" -> jsonResp(mapOf("tracks" to allTracks))
                uri.startsWith("/api/search") -> searchApi(s)
                uri == "/api/play_track" && method == Method.POST -> playTrackApi(s)

                // === HOME ===
                uri == "/api/home" -> homeApi(s)
                uri == "/api/stats" -> statsApi(s)
                uri == "/api/recommendations" -> recsApi(s)

                // === PLAYLISTS ===
                uri == "/api/playlists" && method == Method.GET -> playlistsListApi(s)
                uri == "/api/playlists/create" && method == Method.POST -> playlistCreateApi(s)
                uri.matches(Regex("/api/playlists/(\\d+)/delete")) && method == Method.POST -> playlistDeleteApi(s)
                uri.matches(Regex("/api/playlists/(\\d+)/tracks")) && method == Method.GET -> playlistTracksApi(s)
                uri.matches(Regex("/api/playlists/(\\d+)/tracks")) && method == Method.POST -> playlistAddTrackApi(s)
                uri.matches(Regex("/api/playlists/(\\d+)/tracks/(.+)/remove")) && method == Method.POST -> playlistRemoveTrackApi(s)
                uri.matches(Regex("/api/playlists/(\\d+)")) && method == Method.GET -> playlistGetApi(s)

                // === FAVORITES ===
                uri == "/api/favorites" && method == Method.GET -> favoritesListApi(s)
                uri.matches(Regex("/api/favorites/(.+)/check")) && method == Method.GET -> favoriteCheckApi(s)
                uri.matches(Regex("/api/favorites/(.+)")) && method == Method.POST -> favoriteAddApi(s)
                uri.matches(Regex("/api/favorites/(.+)")) && method == Method.DELETE -> favoriteRemoveApi(s)

                // === HISTORY ===
                uri == "/api/listening_history" && method == Method.GET -> historyListApi(s)
                uri == "/api/listening_history" && method == Method.POST -> historyAddApi(s)
                uri == "/api/listening_history/clear" && method == Method.POST -> historyClearApi(s)

                // === QUEUES ===
                uri == "/api/queue/save" && method == Method.POST -> queueSaveApi(s)
                uri == "/api/queue/saved" && method == Method.GET -> queueListApi(s)
                uri.matches(Regex("/api/queue/saved/(\\d+)")) && method == Method.GET -> queueGetApi(s)
                uri.matches(Regex("/api/queue/saved/(\\d+)")) && method == Method.DELETE -> queueDeleteApi(s)

                // === PROFILE ===
                uri == "/api/profile" && method == Method.GET -> profileGetApi(s)
                uri == "/api/profile/update" && method == Method.POST -> profileUpdateApi(s)

                // === SETTINGS ===
                uri == "/api/settings" && method == Method.GET -> settingsGetApi(s)
                uri == "/api/settings" && method == Method.POST -> settingsUpdateApi(s)

                // === FRIENDS ===
                uri == "/api/friends" && method == Method.GET -> friendsListApi(s)
                uri.startsWith("/api/friends/search") -> friendsSearchApi(s)
                uri.matches(Regex("/api/friends/add/(\\d+)")) && method == Method.POST -> friendAddApi(s)
                uri.matches(Regex("/api/friends/accept/(\\d+)")) && method == Method.POST -> friendAcceptApi(s)

                // === NOTIFICATIONS ===
                uri == "/api/notifications" && method == Method.GET -> notifsListApi(s)

                // === ACTIVITY ===
                uri == "/api/recent_activity" -> activityApi(s)

                // === USER ===
                uri.matches(Regex("/api/user/(\\d+)")) -> userPublicApi(s)

                // === BATTLE PASS ===
                uri == "/api/battle-pass/status" -> bpStatusApi(s)
                uri == "/api/battle-pass/claim" && method == Method.POST -> bpClaimApi(s)
                uri == "/api/battle-pass/quests" -> bpQuestsApi(s)
                uri == "/api/battle-pass/claim-quest" && method == Method.POST -> bpClaimQuestApi(s)
                uri == "/api/battle-pass/daily-bonus" && method == Method.POST -> bpDailyBonusApi(s)

                // === SHOP ===
                uri == "/api/currency/balance" -> currencyBalanceApi(s)
                uri == "/api/shop/items" -> shopItemsApi(s)
                uri == "/api/shop/buy" && method == Method.POST -> shopBuyApi(s)
                uri == "/api/shop/inventory" -> shopInventoryApi(s)
                uri.matches(Regex("/api/shop/equip/(\\d+)")) && method == Method.POST -> shopEquipApi(s)
                uri == "/api/shop/active-items" -> shopActiveApi(s)

                // === RADIO (mock) ===
                uri == "/api/radio/stations" -> jsonResp(radioStations())
                uri == "/api/radio/tracks" -> jsonResp(mapOf("tracks" to allTracks.shuffled().take(5)))

                // === API FALLBACK ===
                uri.startsWith("/api/") -> jsonResp(mapOf("error" to "not_found"), 404)

                // === STATIC FILES ===
                else -> serveFile(uri.removePrefix("/").ifEmpty { "index.html" })
            }
        } catch (e: Exception) {
            e.printStackTrace()
            jsonResp(mapOf("error" to "server_error", "message" to (e.message ?: "")), 500)
        }
    }

    // ==================== AUTH ====================
    private fun registerApi(s: IHTTPSession): Response {
        val body = parseBody(s)
        val username = body["username"] ?: return jsonResp(mapOf("error" to "username_required"), 400)
        val email = body["email"] ?: return jsonResp(mapOf("error" to "email_required"), 400)
        val password = body["password"] ?: return jsonResp(mapOf("error" to "password_required"), 400)
        if (password.length < 4) return jsonResp(mapOf("error" to "password_short"), 400)
        if (usernames.containsKey(username)) return jsonResp(mapOf("error" to "username_taken"), 409)
        if (emails.containsKey(email)) return jsonResp(mapOf("error" to "email_taken"), 409)
        val user = createUser(username, email, password, username)
        val token = createSession(user.id)
        val resp = jsonResp(mapOf("ok" to true, "user" to userToMap(user), "token" to token))
        setCookie(resp, token); return resp
    }

    private fun loginApi(s: IHTTPSession): Response {
        val body = parseBody(s)
        val login = body["login"] ?: return jsonResp(mapOf("error" to "login_required"), 400)
        val password = body["password"] ?: return jsonResp(mapOf("error" to "password_required"), 400)
        val uid = usernames[login] ?: emails[login] ?: return jsonResp(mapOf("error" to "invalid_credentials"), 401)
        val user = users[uid] ?: return jsonResp(mapOf("error" to "invalid_credentials"), 401)
        if (user.passwordHash != hashPassword(password)) return jsonResp(mapOf("error" to "invalid_credentials"), 401)
        user.lastSeen = System.currentTimeMillis()
        val token = createSession(user.id)
        val resp = jsonResp(mapOf("ok" to true, "user" to userToMap(user), "token" to token))
        setCookie(resp, token); return resp
    }

    private fun logoutApi(s: IHTTPSession): Response {
        getSession(s)?.let { sessions.remove(it.token) }
        return jsonResp(mapOf("ok" to true))
    }

    private fun meApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        user.lastSeen = System.currentTimeMillis()
        return jsonResp(userToFullMap(user))
    }

    // ==================== TRACKS ====================
    private fun searchApi(s: IHTTPSession): Response {
        val q = s.parameters.getOrDefault("q", listOf()).firstOrNull()?.lowercase() ?: ""
        val results = if (q.isEmpty()) allTracks else allTracks.filter { t ->
            (t["title"] as? String)?.lowercase()?.contains(q) == true ||
            (t["artist"] as? String)?.lowercase()?.contains(q) == true ||
            (t["album"] as? String)?.lowercase()?.contains(q) == true
        }
        return jsonResp(mapOf("query" to q, "results" to results.map { trackToMap(it) }))
    }

    private fun playTrackApi(s: IHTTPSession): Response {
        val body = parseBody(s)
        val trackId = body["track_id"] ?: return jsonResp(mapOf("error" to "track_id_required"), 400)
        val track = allTracks.find { it["id"] == trackId }
        if (track == null) return jsonResp(mapOf("error" to "track_not_found"), 404)
        return jsonResp(mapOf("ok" to true, "track" to trackToMap(track), "stream_url" to "https://example.com/stream/$trackId"))
    }

    // ==================== HOME ====================
    private fun homeApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val history = getRecentHistory(user.id, 5)
        val favorites = getFavorites(user.id)
        return jsonResp(mapOf(
            "greeting" to when { java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY) < 12 -> "Good morning"
                java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY) < 17 -> "Good afternoon"
                else -> "Good evening" },
            "username" to user.displayName,
            "recently_played" to history.map { it.trackData }.take(5).map { parseJsonObj(it) },
            "made_for_you" to listOf(
                mapOf("id" to 101, "name" to "Daily Mix", "desc" to "Based on your taste", "color" to "#e84393", "emoji" to "🎧"),
                mapOf("id" to 102, "name" to "Discover Weekly", "desc" to "New music for you", "color" to "#fdcb6e", "emoji" to "✨"),
            ),
            "playlists" to getUserPlaylists(user.id).map { p -> playlistToMap(p) },
            "stats" to mapOf("tracks" to history.size, "favorites" to favorites.size, "playlists" to getUserPlaylists(user.id).size)
        ))
    }

    private fun statsApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val history = getRecentHistory(user.id, 1000)
        val totalHours = history.sumOf { it.durationSeconds } / 3600
        return jsonResp(mapOf(
            "tracks" to history.size, "playlists" to getUserPlaylists(user.id).size,
            "favorites" to getFavorites(user.id).size, "hours" to totalHours,
            "username" to user.displayName
        ))
    }

    private fun recsApi(s: IHTTPSession): Response {
        return jsonResp(mapOf("recommendations" to allTracks.shuffled().take(6).map { trackToMap(it) }))
    }

    // ==================== PLAYLISTS ====================
    private fun playlistsListApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("playlists" to getUserPlaylists(user.id).map { p ->
            val tracks = getPlaylistTracks(p.id)
            playlistToMap(p) + mapOf("track_count" to tracks.size)
        }))
    }

    private fun playlistCreateApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        val title = body["title"] ?: return jsonResp(mapOf("error" to "title_required"), 400)
        val desc = body["description"] ?: ""
        val color = body["color"] ?: "#6c5ce7"
        val pl = createPlaylist(user.id, title, desc, color)
        return jsonResp(mapOf("ok" to true, "playlist" to playlistToMap(pl)))
    }

    private fun playlistGetApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val id = s.uri.removePrefix("/api/playlists/").split("/").firstOrNull()?.toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val pl = playlists[id] ?: return jsonResp(mapOf("error" to "not_found"), 404)
        if (pl.userId != user.id && !pl.isPublic) return jsonResp(mapOf("error" to "forbidden"), 403)
        return jsonResp(playlistToMap(pl) + mapOf("tracks" to getPlaylistTracks(id).map { parseJsonObj(it.trackData) }))
    }

    private fun playlistTracksApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val id = s.uri.removePrefix("/api/playlists/").split("/").firstOrNull()?.toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val pl = playlists[id] ?: return jsonResp(mapOf("error" to "not_found"), 404)
        if (pl.userId != user.id && !pl.isPublic) return jsonResp(mapOf("error" to "forbidden"), 403)
        return jsonResp(mapOf("tracks" to getPlaylistTracks(id).map { parseJsonObj(it.trackData) }))
    }

    private fun playlistAddTrackApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val id = s.uri.removePrefix("/api/playlists/").split("/").firstOrNull()?.toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val pl = playlists[id] ?: return jsonResp(mapOf("error" to "not_found"), 404)
        if (pl.userId != user.id) return jsonResp(mapOf("error" to "forbidden"), 403)
        val body = parseBody(s)
        val trackId = body["track_id"] ?: return jsonResp(mapOf("error" to "track_id_required"), 400)
        val trackData = body["track_data"] ?: "{}"
        addTrackToPlaylist(id, trackId, trackData)
        pl.updatedAt = System.currentTimeMillis()
        return jsonResp(mapOf("ok" to true))
    }

    private fun playlistRemoveTrackApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val parts = s.uri.removePrefix("/api/playlists/").split("/")
        val plId = parts.firstOrNull()?.toIntOrNull() ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val pl = playlists[plId] ?: return jsonResp(mapOf("error" to "not_found"), 404)
        if (pl.userId != user.id) return jsonResp(mapOf("error" to "forbidden"), 403)
        val trackId = parts.getOrNull(2) ?: return jsonResp(mapOf("error" to "track_id_required"), 400)
        val tracks = playlistTracks.getOrPut(plId) { mutableListOf() }
        tracks.removeAll { it.trackId == trackId }
        pl.updatedAt = System.currentTimeMillis()
        return jsonResp(mapOf("ok" to true))
    }

    private fun playlistDeleteApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val id = s.uri.removePrefix("/api/playlists/").split("/").firstOrNull()?.toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val pl = playlists[id] ?: return jsonResp(mapOf("error" to "not_found"), 404)
        if (pl.userId != user.id) return jsonResp(mapOf("error" to "forbidden"), 403)
        playlists.remove(id)
        playlistTracks.remove(id)
        return jsonResp(mapOf("ok" to true))
    }

    // ==================== FAVORITES ====================
    private fun favoritesListApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("favorites" to getFavorites(user.id).map { parseJsonObj(it.trackData) }))
    }

    private fun favoriteAddApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val trackId = s.uri.removePrefix("/api/favorites/").split("/").first()
        if (getFavorites(user.id).any { it.trackId == trackId })
            return jsonResp(mapOf("ok" to true, "already" to true))
        val body = parseBody(s)
        val trackData = body["track_data"] ?: "{}"
        val id = nextLikedId++
        val lt = LikedTrack(id, user.id, trackId, trackData)
        likedTracks.getOrPut(user.id) { mutableListOf() }.add(lt)
        addActivity(user.id, "favorite_add", """{"track_id":"$trackId"}""")
        return jsonResp(mapOf("ok" to true, "id" to id))
    }

    private fun favoriteRemoveApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val trackId = s.uri.removePrefix("/api/favorites/").split("/").first()
        likedTracks.getOrPut(user.id) { mutableListOf() }.removeAll { it.trackId == trackId }
        return jsonResp(mapOf("ok" to true))
    }

    private fun favoriteCheckApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val trackId = s.uri.removePrefix("/api/favorites/").split("/").first()
        val liked = getFavorites(user.id).any { it.trackId == trackId }
        return jsonResp(mapOf("liked" to liked))
    }

    // ==================== HISTORY ====================
    private fun historyListApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("history" to getRecentHistory(user.id, 50).map { h ->
            mapOf("id" to h.id, "track_id" to h.trackId, "track" to parseJsonObj(h.trackData),
                  "artist_name" to h.artistName, "duration_seconds" to h.durationSeconds, "played_at" to h.playedAt)
        }))
    }

    private fun historyAddApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        val trackId = body["track_id"] ?: return jsonResp(mapOf("error" to "track_id_required"), 400)
        val trackData = body["track_data"] ?: "{}"
        val artistName = body["artist_name"] ?: ""
        val duration = body["duration"]?.toIntOrNull() ?: 0
        val id = nextHistoryId++
        listeningHistory.getOrPut(user.id) { mutableListOf() }.add(
            ListeningHistory(id, user.id, trackId, trackData, artistName, duration)
        )
        addActivity(user.id, "listen", """{"track_id":"$trackId","artist":"$artistName"}""")
        return jsonResp(mapOf("ok" to true, "id" to id))
    }

    private fun historyClearApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        listeningHistory.remove(user.id)
        return jsonResp(mapOf("ok" to true))
    }

    // ==================== QUEUES ====================
    private fun queueSaveApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        val name = body["name"] ?: "Queue ${System.currentTimeMillis() % 1000}"
        val tracksData = body["tracks_data"] ?: "[]"
        val id = nextQueueId++
        savedQueues.getOrPut(user.id) { mutableListOf() }.add(SavedQueue(id, user.id, name, tracksData))
        return jsonResp(mapOf("ok" to true, "id" to id))
    }

    private fun queueListApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("queues" to (savedQueues[user.id] ?: emptyList()).map { q ->
            mapOf("id" to q.id, "name" to q.name, "tracks" to parseJsonArray(q.tracksData),
                  "created_at" to q.createdAt, "updated_at" to q.updatedAt)
        }))
    }

    private fun queueGetApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val id = s.uri.removePrefix("/api/queue/saved/").toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val q = (savedQueues[user.id] ?: emptyList()).find { it.id == id }
            ?: return jsonResp(mapOf("error" to "not_found"), 404)
        return jsonResp(mapOf("id" to q.id, "name" to q.name, "tracks" to parseJsonArray(q.tracksData)))
    }

    private fun queueDeleteApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val id = s.uri.removePrefix("/api/queue/saved/").toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        savedQueues.getOrPut(user.id) { mutableListOf() }.removeAll { it.id == id }
        return jsonResp(mapOf("ok" to true))
    }

    // ==================== PROFILE ====================
    private fun profileGetApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(userToFullMap(user))
    }

    private fun profileUpdateApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        body["display_name"]?.let { if (it.isNotBlank()) user.displayName = it }
        body["bio"]?.let { user.bio = it }
        body["avatar_emoji"]?.let { user.avatarEmoji = it }
        body["current_source"]?.let { user.currentSource = it }
        body["discord_webhook"]?.let { user.discordWebhook = it }
        body["discord_enabled"]?.let { user.discordEnabled = it == "true" }
        return jsonResp(mapOf("ok" to true, "user" to userToFullMap(user)))
    }

    // ==================== SETTINGS ====================
    private fun settingsGetApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf(
            "theme" to user.theme, "language" to user.language, "auto_play" to user.autoPlay,
            "music_service" to user.musicService
        ))
    }

    private fun settingsUpdateApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        body["theme"]?.let { user.theme = it }
        body["language"]?.let { user.language = it }
        body["auto_play"]?.let { user.autoPlay = it == "true" }
        body["music_service"]?.let { user.musicService = it }
        return jsonResp(mapOf("ok" to true))
    }

    // ==================== FRIENDS ====================
    private fun friendsListApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val list = (friends[user.id] ?: emptyList()).filter { it.status == "accepted" }.map { f ->
            val fu = users[f.friendId]
            mapOf("id" to f.id, "user_id" to f.friendId, "username" to (fu?.username ?: "unknown"),
                  "display_name" to (fu?.displayName ?: "Unknown"), "avatar_emoji" to (fu?.avatarEmoji ?: "👤"),
                  "taste_match" to f.tasteMatch)
        }
        val requests = (friends[user.id] ?: emptyList()).filter { it.status == "pending" && it.friendId == user.id }.map { f ->
            val fu = users[f.userId]
            mapOf("id" to f.id, "user_id" to f.userId, "username" to (fu?.username ?: "unknown"),
                  "display_name" to (fu?.displayName ?: "Unknown"), "avatar_emoji" to (fu?.avatarEmoji ?: "👤"))
        }
        return jsonResp(mapOf("friends" to list, "requests" to requests))
    }

    private fun friendsSearchApi(s: IHTTPSession): Response {
        val q = s.parameters.getOrDefault("q", listOf()).firstOrNull()?.lowercase() ?: ""
        val results = users.values.filter { u ->
            u.username.lowercase().contains(q) || u.displayName.lowercase().contains(q)
        }.map { mapOf("id" to it.id, "username" to it.username, "display_name" to it.displayName, "avatar_emoji" to it.avatarEmoji) }
        return jsonResp(mapOf("results" to results))
    }

    private fun friendAddApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val friendId = s.uri.removePrefix("/api/friends/add/").toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        if (friendId == user.id) return jsonResp(mapOf("error" to "cannot_add_self"), 400)
        if (!users.containsKey(friendId)) return jsonResp(mapOf("error" to "user_not_found"), 404)
        val existing = (friends[user.id] ?: emptyList()).any { it.friendId == friendId }
        if (existing) return jsonResp(mapOf("error" to "already_friends"), 409)
        val id = nextFriendId++
        friends.getOrPut(user.id) { mutableListOf() }.add(Friend(id, user.id, friendId, "pending"))
        friends.getOrPut(friendId) { mutableListOf() }.add(Friend(id, user.id, friendId, "pending"))
        addNotification(friendId, "friend_request", "${user.displayName} sent you a friend request")
        return jsonResp(mapOf("ok" to true))
    }

    private fun friendAcceptApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val friendId = s.uri.removePrefix("/api/friends/accept/").toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        (friends[user.id] ?: mutableListOf()).filter { it.friendId == friendId && it.status == "pending" }
            .forEach { it.status = "accepted" }
        (friends[friendId] ?: mutableListOf()).filter { it.friendId == user.id && it.status == "pending" }
            .forEach { it.status = "accepted" }
        return jsonResp(mapOf("ok" to true))
    }

    // ==================== NOTIFICATIONS ====================
    private fun notifsListApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("notifications" to (notifications[user.id] ?: emptyList()).map { n ->
            mapOf("id" to n.id, "type" to n.type, "message" to n.message, "read" to n.read, "created_at" to n.createdAt)
        }))
    }

    // ==================== ACTIVITY ====================
    private fun activityApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("activities" to (activities[user.id] ?: emptyList()).map { a ->
            mapOf("id" to a.id, "type" to a.activityType, "data" to parseJsonObj(a.activityData), "created_at" to a.createdAt)
        }))
    }

    // ==================== USER PUBLIC ====================
    private fun userPublicApi(s: IHTTPSession): Response {
        val id = s.uri.removePrefix("/api/user/").toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val u = users[id] ?: return jsonResp(mapOf("error" to "not_found"), 404)
        val userPlaylists = getUserPlaylists(id).filter { it.isPublic }
        return jsonResp(mapOf(
            "id" to u.id, "username" to u.username, "display_name" to u.displayName,
            "avatar_emoji" to u.avatarEmoji, "bio" to u.bio,
            "playlists" to userPlaylists.size, "favorites" to getFavorites(id).size,
            "created_at" to u.createdAt
        ))
    }

    // ==================== RADIO ====================
    private fun radioStations() = listOf(
        mapOf("id" to "personal", "name" to "Personal", "icon" to "🎵", "color" to "#6c5ce7"),
        mapOf("id" to "pop", "name" to "Pop", "icon" to "🎤", "color" to "#e17055"),
        mapOf("id" to "rock", "name" to "Rock", "icon" to "🎸", "color" to "#e84393"),
        mapOf("id" to "electronic", "name" to "Electronic", "icon" to "🎹", "color" to "#00b894"),
        mapOf("id" to "jazz", "name" to "Jazz", "icon" to "🎷", "color" to "#fdcb6e"),
        mapOf("id" to "classical", "name" to "Classical", "icon" to "🎻", "color" to "#0984e3"),
    )

    // ==================== INTERNAL ====================
    private fun healthData() = mapOf(
        "status" to "online", "version" to "1.1.0",
        "features" to listOf("auth", "playback", "search", "playlists", "favorites", "history",
                             "queues", "profile", "settings", "friends", "notifications", "radio",
                             "activity", "battle_pass", "shop", "currency"),
        "backend" to "nanohttpd-kotlin"
    )

    private fun createUser(username: String, email: String, password: String, display: String): User {
        val id = nextUserId++
        val user = User(id, username, email, hashPassword(password), displayName = display)
        users[id] = user; usernames[username] = id; emails[email] = id
        return user
    }

    private fun createSession(userId: Int): String {
        val token = generateToken()
        sessions[token] = Session(token, userId)
        return token
    }

    private fun createPlaylist(userId: Int, title: String, desc: String, color: String): Playlist {
        val id = nextPlaylistId++
        val pl = Playlist(id, userId, title, desc, coverUrl = color, isPublic = true)
        playlists[id] = pl
        playlistTracks[id] = mutableListOf()
        addActivity(userId, "playlist_create", """{"playlist_id":$id,"title":"$title"}""")
        return pl
    }

    private fun addTrackToPlaylist(playlistId: Int, trackId: String, trackData: String) {
        val tracks = playlistTracks.getOrPut(playlistId) { mutableListOf() }
        if (tracks.none { it.trackId == trackId }) {
            val id = nextTrackId++
            tracks.add(PlaylistTrack(id, playlistId, trackId, trackData, tracks.size))
        }
    }

    private fun getFavorites(userId: Int): List<LikedTrack> = likedTracks[userId] ?: emptyList()

    private fun getRecentHistory(userId: Int, limit: Int): List<ListeningHistory> =
        (listeningHistory[userId] ?: emptyList()).sortedByDescending { it.playedAt }.take(limit)

    private fun getUserPlaylists(userId: Int): List<Playlist> =
        playlists.values.filter { it.userId == userId }

    private fun getPlaylistTracks(playlistId: Int): List<PlaylistTrack> =
        playlistTracks[playlistId] ?: emptyList()

    private fun addActivity(userId: Int, type: String, data: String) {
        val id = nextActivityId++
        activities.getOrPut(userId) { mutableListOf() }.add(UserActivity(id, userId, type, data))
    }

    private fun addNotification(userId: Int, type: String, msg: String) {
        val id = nextNotifId++
        notifications.getOrPut(userId) { mutableListOf() }.add(Notification(id, userId, type, msg))
    }

    private fun userToMap(u: User) = mapOf(
        "id" to u.id, "username" to u.username, "email" to u.email,
        "displayName" to u.displayName, "avatarEmoji" to u.avatarEmoji
    )

    private fun userToFullMap(u: User) = mapOf(
        "id" to u.id, "username" to u.username, "email" to u.email,
        "displayName" to u.displayName, "bio" to u.bio,
        "avatarUrl" to u.avatarUrl, "avatarEmoji" to u.avatarEmoji,
        "currentSource" to u.currentSource, "discordWebhook" to u.discordWebhook,
        "discordEnabled" to u.discordEnabled, "isAdmin" to u.isAdmin,
        "balance" to u.balance, "theme" to u.theme, "language" to u.language,
        "autoPlay" to u.autoPlay, "musicService" to u.musicService,
        "equippedBadge" to u.equippedBadge, "equippedFrame" to u.equippedFrame,
        "createdAt" to u.createdAt, "lastSeen" to u.lastSeen
    )

    private fun playlistToMap(p: Playlist) = mapOf(
        "id" to p.id, "title" to p.title, "description" to p.description,
        "cover" to p.coverUrl, "is_public" to p.isPublic,
        "created_at" to p.createdAt, "updated_at" to p.updatedAt
    )

    // ==================== BATTLE PASS ====================
    private fun getOrCreateBp(userId: Int): UserBp {
        val season = bpSeasons.values.firstOrNull { it.isActive } ?: return UserBp(0, userId, 0)
        val existing = (userBps[userId] ?: emptyList()).find { it.seasonId == season.id }
        if (existing != null) return existing
        val id = nextBpUserId++
        val ubp = UserBp(id, userId, season.id)
        userBps.getOrPut(userId) { mutableListOf() }.add(ubp)
        return ubp
    }

    private fun bpStatusApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val season = bpSeasons.values.firstOrNull { it.isActive }
        if (season == null) return jsonResp(mapOf("error" to "no_active_season"), 404)
        val ubp = getOrCreateBp(user.id)
        val levels = bpLevels[season.id] ?: emptyList()
        val currentLevelDef = levels.find { it.level == ubp.level }
        val nextLevelDef = levels.find { it.level == ubp.level + 1 }
        val xpForCurrent = currentLevelDef?.xpRequired ?: 100
        val xpForNext = nextLevelDef?.xpRequired ?: (xpForCurrent + 100)
        return jsonResp(mapOf(
            "season" to mapOf("id" to season.id, "name" to season.name, "max_level" to season.maxLevel,
                "end_date" to season.endDate),
            "level" to ubp.level, "xp" to ubp.xp, "xp_for_next" to xpForNext,
            "has_premium" to ubp.hasPremium, "claimed_free" to parseJsonArrayRaw(ubp.claimedFree),
            "claimed_premium" to parseJsonArrayRaw(ubp.claimedPremium),
            "progress" to (ubp.xp.toFloat() / xpForNext.coerceAtLeast(1)),
            "rewards" to (levels.find { it.level == ubp.level }?.let { lv ->
                mapOf("free" to parseJsonObj(lv.freeReward), "premium" to parseJsonObj(lv.premiumReward))
            })
        ))
    }

    private fun bpClaimApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        val level = body["level"]?.toIntOrNull() ?: return jsonResp(mapOf("error" to "level_required"), 400)
        val tier = body["tier"] ?: "free"
        val ubp = getOrCreateBp(user.id)
        if (level > ubp.level) return jsonResp(mapOf("error" to "level_not_reached"), 400)
        val claimed = if (tier == "premium") parseJsonArrayRaw(ubp.claimedPremium) else parseJsonArrayRaw(ubp.claimedFree)
        if (claimed.contains(level)) return jsonResp(mapOf("error" to "already_claimed"), 400)
        val season = bpSeasons[ubp.seasonId] ?: return jsonResp(mapOf("error" to "no_season"), 404)
        val levelDef = bpLevels[season.id]?.find { it.level == level } ?: return jsonResp(mapOf("error" to "no_rewards"), 404)
        val reward = if (tier == "premium") levelDef.premiumReward else levelDef.freeReward
        val rewardData = parseJsonObj(reward)
        val coins = (rewardData["coins"] as? String)?.toIntOrNull() ?: 0
        user.balance += coins
        addTx(user.id, coins, "battle_pass_lvl_$level")
        val newClaimed = claimed + level
        if (tier == "premium") ubp.claimedPremium = toJson(newClaimed) else ubp.claimedFree = toJson(newClaimed)
        return jsonResp(mapOf("ok" to true, "reward" to rewardData, "new_balance" to user.balance))
    }

    private fun bpQuestsApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val season = bpSeasons.values.firstOrNull { it.isActive }
        if (season == null) return jsonResp(mapOf("error" to "no_active_season"), 404)
        val quests = (bpQuests[season.id] ?: emptyList()).filter { it.isActive }
        val today = System.currentTimeMillis() / 86400000L
        return jsonResp(mapOf("quests" to quests.map { q ->
            val uq = (userQuests[user.id] ?: emptyList()).find { it.questId == q.id && it.assignedDate / 86400000L == today }
            mapOf("id" to q.id, "type" to q.type, "description" to q.description, "xp_reward" to q.xpReward,
                "progress" to (uq?.progress ?: 0), "required" to q.reqValue,
                "completed" to (uq?.completed ?: false), "claimed" to (uq?.claimed ?: false))
        }))
    }

    private fun bpClaimQuestApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        val questId = body["quest_id"]?.toIntOrNull() ?: return jsonResp(mapOf("error" to "quest_id_required"), 400)
        val today = System.currentTimeMillis() / 86400000L
        val uq = (userQuests[user.id] ?: emptyList()).find { it.questId == questId && it.assignedDate / 86400000L == today }
        if (uq == null || !uq.completed || uq.claimed) return jsonResp(mapOf("error" to "cannot_claim"), 400)
        uq.claimed = true
        val ubp = getOrCreateBp(user.id)
        ubp.xp += (bpQuests[ubp.seasonId]?.find { it.id == questId }?.xpReward ?: 0)
        checkBpLevelUp(ubp)
        return jsonResp(mapOf("ok" to true, "xp" to ubp.xp, "level" to ubp.level))
    }

    private fun bpDailyBonusApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val ubp = getOrCreateBp(user.id)
        val today = System.currentTimeMillis() / 86400000L
        if (ubp.lastDailyBonus / 86400000L == today) return jsonResp(mapOf("error" to "already_claimed"), 400)
        ubp.lastDailyBonus = System.currentTimeMillis()
        ubp.xp += 20
        user.balance += 5
        addTx(user.id, 5, "daily_bonus")
        checkBpLevelUp(ubp)
        return jsonResp(mapOf("ok" to true, "xp" to ubp.xp, "level" to ubp.level, "coins" to 5))
    }

    private fun checkBpLevelUp(ubp: UserBp) {
        val season = bpSeasons[ubp.seasonId] ?: return
        val levels = bpLevels[season.id] ?: return
        while (ubp.level < season.maxLevel) {
            val nextLv = levels.find { it.level == ubp.level + 1 } ?: break
            if (ubp.xp >= nextLv.xpRequired) { ubp.level++; ubp.xp -= nextLv.xpRequired }
            else break
        }
    }

    // ==================== SHOP ====================
    private fun currencyBalanceApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("balance" to user.balance))
    }

    private fun shopItemsApi(s: IHTTPSession): Response {
        return jsonResp(mapOf("items" to shopItems.values.filter { it.isActive }.map { si ->
            mapOf("id" to si.id, "name" to si.name, "type" to si.type, "category" to si.category,
                "price" to si.price, "rarity" to si.rarity, "data" to parseJsonObj(si.data))
        }))
    }

    private fun shopBuyApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val body = parseBody(s)
        val itemId = body["item_id"]?.toIntOrNull() ?: return jsonResp(mapOf("error" to "item_id_required"), 400)
        val item = shopItems[itemId] ?: return jsonResp(mapOf("error" to "item_not_found"), 404)
        if (!item.isActive) return jsonResp(mapOf("error" to "item_unavailable"), 400)
        if (user.balance < item.price) return jsonResp(mapOf("error" to "insufficient_funds"), 400)
        user.balance -= item.price
        addTx(user.id, -item.price, "bought_${item.name}")
        val invId = nextInvId++
        inventory.getOrPut(user.id) { mutableListOf() }.add(
            UserInventory(invId, user.id, item.id.toString(), item.type, item.data)
        )
        return jsonResp(mapOf("ok" to true, "new_balance" to user.balance, "inventory_id" to invId))
    }

    private fun shopInventoryApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        return jsonResp(mapOf("inventory" to (inventory[user.id] ?: emptyList()).map { inv ->
            mapOf("id" to inv.id, "item_id" to inv.itemId, "item_type" to inv.itemType,
                "data" to parseJsonObj(inv.data), "equipped" to inv.equipped, "purchased_at" to inv.purchasedAt)
        }))
    }

    private fun shopEquipApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val invId = s.uri.removePrefix("/api/shop/equip/").toIntOrNull()
            ?: return jsonResp(mapOf("error" to "invalid_id"), 400)
        val invList = inventory.getOrPut(user.id) { mutableListOf() }
        val item = invList.find { it.id == invId } ?: return jsonResp(mapOf("error" to "not_found"), 404)
        invList.forEach { it.equipped = it.id == invId }
        when (item.itemType) {
            "badge" -> user.equippedBadge = item.itemId
            "frame" -> user.equippedFrame = item.itemId
        }
        return jsonResp(mapOf("ok" to true, "item_type" to item.itemType, "item_id" to item.itemId))
    }

    private fun shopActiveApi(s: IHTTPSession): Response {
        val user = requireUser(s) ?: return jsonResp(mapOf("error" to "unauthorized"), 401)
        val equipped = (inventory[user.id] ?: emptyList()).filter { it.equipped }
        return jsonResp(mapOf("equipped" to equipped.map { inv ->
            mapOf("id" to inv.id, "item_type" to inv.itemType, "data" to parseJsonObj(inv.data))
        }, "badge" to user.equippedBadge, "frame" to user.equippedFrame))
    }

    private fun addTx(userId: Int, amount: Int, reason: String) {
        val id = nextTxId++; currencyTx.getOrPut(userId) { mutableListOf() }.add(CurrencyTx(id, userId, amount, reason))
    }

    private fun parseJsonArrayRaw(str: String): List<Int> {
        val trimmed = str.trim()
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return emptyList()
        return try { trimmed.removeSurrounding("[", "]").split(",").mapNotNull { it.trim().toIntOrNull() } }
        catch (_: Exception) { emptyList() }
    }

    private fun parseBody(s: IHTTPSession): Map<String, String> {
        return try {
            val files = HashMap<String, String>()
            s.parseBody(files)
            s.parms?.mapValues { it.value ?: "" } ?: emptyMap()
        } catch (_: Exception) { emptyMap() }
    }

    private fun serveFile(path: String): Response {
        val safe = path.removePrefix("/").takeWhile { !it.isWhitespace() }.ifEmpty { "index.html" }
        return try {
            val stream: InputStream = assets.open(safe)
            val ext = safe.substringAfterLast('.', "bin")
            newChunkedResponse(Response.Status.OK, MIME[ext] ?: "application/octet-stream", stream)
        } catch (_: Exception) {
            newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "404")
        }
    }

    private fun jsonResp(data: Any): Response = jsonResp(data, 200)
    private fun jsonResp(data: Any, status: Int): Response =
        newFixedLengthResponse(Response.Status.lookup(status) ?: Response.Status.OK, "application/json", toJson(data))

    private fun toJson(obj: Any?): String = when (obj) {
        null -> "null"
        is String -> "\"" + obj.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
        is Number, is Boolean -> obj.toString()
        is Map<*, *> -> obj.entries.joinToString(",", "{", "}") { (k, v) -> "\"$k\":${toJson(v)}" }
        is List<*> -> obj.joinToString(",", "[", "]") { toJson(it) }
        else -> "\"$obj\""
    }

    private fun parseJsonObj(str: String): Map<String, Any?> {
        return try {
            val map = LinkedHashMap<String, Any?>()
            val trimmed = str.trim()
            if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return map
            val inner = trimmed.substring(1, trimmed.length - 1)
            var depth = 0; val sb = StringBuilder(); var key: String? = null; var inStr = false
            for (c in inner) {
                when {
                    c == '"' && (sb.isEmpty() || sb.last() != '\\') -> inStr = !inStr
                    !inStr && c == '{' -> depth++
                    !inStr && c == '}' -> depth--
                    !inStr && c == ',' && depth == 0 -> {
                        val parts = sb.toString().split(":", limit = 2)
                        if (parts.size == 2) map[parts[0].trim().removeSurrounding("\"")] = parts[1].trim().removeSurrounding("\"")
                        sb.clear()
                    }
                    else -> sb.append(c)
                }
            }
            if (sb.isNotEmpty()) {
                val parts = sb.toString().split(":", limit = 2)
                if (parts.size == 2) map[parts[0].trim().removeSurrounding("\"")] = parts[1].trim().removeSurrounding("\"")
            }
            map
        } catch (_: Exception) { emptyMap() }
    }

    private fun parseJsonArray(str: String): List<Any?> {
        val trimmed = str.trim()
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return emptyList()
        return try { toJson(emptyList<Any>()); emptyList<Any>() } catch (_: Exception) { emptyList() }
    }

    override fun start() {
        super.start()
        android.util.Log.i("iTired", "Server started on port 5001 with full feature set")
    }

    companion object {
        private val MIME = mapOf(
            "html" to "text/html; charset=utf-8", "css" to "text/css; charset=utf-8",
            "js" to "application/javascript; charset=utf-8", "json" to "application/json",
            "png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg",
            "gif" to "image/gif", "svg" to "image/svg+xml", "ico" to "image/x-icon",
        )
    }
}
