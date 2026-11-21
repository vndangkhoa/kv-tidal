package com.kvtidal.app.ui.screens.search

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.AlbumHit
import com.kvtidal.app.data.model.ArtistHit
import com.kvtidal.app.data.model.TidalPreSearchResponse
import com.kvtidal.app.data.model.TidalSearchItem
import com.kvtidal.app.data.model.Track
import com.kvtidal.app.data.model.UniversalSearchResponse
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.player.PlayerManager
import com.kvtidal.app.ui.adaptive.LocalWindowState
import com.kvtidal.app.ui.adaptive.MaxContentWidthDp
import com.kvtidal.app.ui.components.QualityBadgePill
import com.kvtidal.app.ui.components.TrackListItem
import com.kvtidal.app.ui.components.YtmIcons
import com.kvtidal.app.ui.theme.*
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.util.Locale

private data class MoodGenreTile(
    val title: String,
    val query: String,
    val accentColor: Color
)

private val TIDAL_MOOD_GENRES = listOf(
    MoodGenreTile("Hi-Res 24-Bit", "24bit flac master", TidalMaxGold),
    MoodGenreTile("V-Pop Lossless", "V-Pop Nhac Viet", TidalCyanAccent),
    MoodGenreTile("Audiophile Vocal", "audiophile female vocal", TidalCyan),
    MoodGenreTile("Jazz & Acoustic", "jazz acoustic trio", Color(0xFF38BDF8)),
    MoodGenreTile("Symphony & Film", "orchestral soundtrack score", Color(0xFFA78BFA)),
    MoodGenreTile("Electronic & Synth", "electronic synthwave lossless", TidalEmerald),
    MoodGenreTile("Rock & Metal", "classic rock flac", Color(0xFFF97316)),
    MoodGenreTile("R&B & Soul", "neo soul rnb", Color(0xFFEC4899)),
    MoodGenreTile("Chill & Ambient", "ambient chillout piano", Color(0xFF2DD4BF)),
    MoodGenreTile("Piano & Solo", "piano solo instrumental", Color(0xFF60A5FA)),
    MoodGenreTile("Lo-Fi & Focus", "lofi instrumental focus", Color(0xFF818CF8)),
    MoodGenreTile("Live Sessions", "unplugged live acoustic", Color(0xFFFBBF24))
)

private enum class SearchTab(val label: String) {
    ALL("All"),
    HIRES_MAX("Hi-Res MAX"),
    NAS_VAULT("NAS Vault"),
    TIDAL("Tidal"),
    QOBUZ("Qobuz"),
    ALBUMS("Albums"),
    ARTISTS("Artists")
}

@Composable
fun SearchScreen(
    musicRepo: MusicRepository,
    onBack: () -> Unit,
    onTrackPlay: (Track, List<Track>) -> Unit,
    onArtistClick: (ArtistHit) -> Unit,
    onAlbumClick: (AlbumHit) -> Unit,
    bottomPadding: Dp = 0.dp
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val windowState = LocalWindowState.current
    val likedIds by PlayerManager.likedTrackIds.collectAsState()

    val historyPrefs = remember { context.getSharedPreferences("kv_tidal_search_history", Context.MODE_PRIVATE) }
    var searchHistory by remember { mutableStateOf(readSearchHistory(historyPrefs)) }

    var query by remember { mutableStateOf("") }
    var isInputFocused by remember { mutableStateOf(false) }
    var activeTab by remember { mutableStateOf(SearchTab.ALL) }

    var preSearch by remember { mutableStateOf<TidalPreSearchResponse?>(null) }
    var newReleaseAlbums by remember { mutableStateOf(musicRepo.getCachedTrendingAlbums("VN")) }
    var popularArtists by remember { mutableStateOf(musicRepo.getCachedArtists("all")) }
    var fallbackTrendingTracks by remember { mutableStateOf(musicRepo.getCachedCharts("VN")) }

    var searchResult by remember { mutableStateOf(UniversalSearchResponse()) }
    var filteredSourceTracks by remember { mutableStateOf<List<Track>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var hasSearched by remember { mutableStateOf(false) }

    val voiceLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                ?.trim()
            if (!spoken.isNullOrBlank()) {
                query = spoken
            }
        }
    }

    fun recordHistory(term: String) {
        val clean = term.trim()
        if (clean.isEmpty()) return
        val next = (listOf(clean) + searchHistory.filterNot { it.equals(clean, ignoreCase = true) }).take(12)
        searchHistory = next
        saveSearchHistory(historyPrefs, next)
    }

    fun executeSearchNow(term: String) {
        val q = term.trim()
        if (q.isEmpty()) return
        recordHistory(q)
        scope.launch {
            isSearching = true
            musicRepo.universalSearch(q).onSuccess {
                searchResult = it
                hasSearched = true
            }
            if (activeTab == SearchTab.TIDAL || activeTab == SearchTab.QOBUZ || activeTab == SearchTab.NAS_VAULT) {
                val srcParam = when (activeTab) {
                    SearchTab.TIDAL -> "tidal"
                    SearchTab.QOBUZ -> "qobuz"
                    SearchTab.NAS_VAULT -> "local"
                    else -> null
                }
                musicRepo.search(q, source = srcParam).onSuccess {
                    filteredSourceTracks = it
                }
            }
            isSearching = false
        }
    }

    LaunchedEffect(Unit) {
        val preDef = async { musicRepo.getPreSearchTrending() }
        val albDef = async { musicRepo.getNewReleases("VN") }
        val artDef = async { musicRepo.getArtists("all") }
        val chartDef = async { musicRepo.getCharts("VN") }
        preDef.await().onSuccess { preSearch = it }
        albDef.await().onSuccess { newReleaseAlbums = it }
        artDef.await().onSuccess { popularArtists = it }
        chartDef.await().onSuccess { fallbackTrendingTracks = it }
    }

    // Debounced live search as user types
    LaunchedEffect(query) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            searchResult = UniversalSearchResponse()
            filteredSourceTracks = emptyList()
            hasSearched = false
            isSearching = false
            return@LaunchedEffect
        }
        delay(320)
        isSearching = true
        musicRepo.universalSearch(trimmed).onSuccess {
            searchResult = it
            hasSearched = true
        }
        isSearching = false
    }

    LaunchedEffect(activeTab, query) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            filteredSourceTracks = emptyList()
            return@LaunchedEffect
        }
        val src = when (activeTab) {
            SearchTab.TIDAL -> "tidal"
            SearchTab.QOBUZ -> "qobuz"
            SearchTab.NAS_VAULT -> "local"
            else -> null
        }
        if (src != null) {
            isSearching = true
            musicRepo.search(trimmed, source = src).onSuccess {
                filteredSourceTracks = it
            }
            isSearching = false
        } else {
            filteredSourceTracks = emptyList()
        }
    }

    val exploreQuickPicks = remember(preSearch, fallbackTrendingTracks) {
        val items = preSearch?.quickPicks.orEmpty()
        if (items.isNotEmpty()) items.map { it.toTrack() } else fallbackTrendingTracks
    }

    val exploreArtists = remember(preSearch, popularArtists) {
        val fromPre = preSearch?.topArtists.orEmpty().map {
            ArtistHit(
                id = it.name.lowercase().replace(" ", "-"),
                name = it.name,
                coverUrl = RetrofitClient.resolveCoverUrl(it.coverUrl),
                subscribers = "${it.trackCount} tracks"
            )
        }
        if (fromPre.isNotEmpty()) fromPre else popularArtists
    }

    val displaySongs = remember(activeTab, searchResult, filteredSourceTracks) {
        when (activeTab) {
            SearchTab.ALL -> searchResult.songs
            SearchTab.HIRES_MAX -> searchResult.songs.filter { it.hires || it.isMaxQuality }
            SearchTab.NAS_VAULT, SearchTab.TIDAL, SearchTab.QOBUZ -> {
                if (filteredSourceTracks.isNotEmpty()) {
                    filteredSourceTracks
                } else {
                    val needle = when (activeTab) {
                        SearchTab.NAS_VAULT -> "local"
                        SearchTab.TIDAL -> "tidal"
                        SearchTab.QOBUZ -> "qobuz"
                        else -> ""
                    }
                    searchResult.songs.filter { it.source.contains(needle, ignoreCase = true) }
                }
            }
            SearchTab.ALBUMS, SearchTab.ARTISTS -> emptyList()
        }
    }

    val horizontalGutter = if (windowState.isWide) 24.dp else 16.dp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TidalPureBlack)
            .statusBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Sticky Search Bar Container
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = MaxContentWidthDp.dp)
                .padding(horizontal = horizontalGutter, vertical = 10.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(TidalCard)
                    .border(
                        width = 1.dp,
                        color = if (isInputFocused) TidalCyanAccent else TidalWhite15,
                        shape = RoundedCornerShape(24.dp)
                    )
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        if (query.isNotEmpty()) {
                            query = ""
                            keyboard?.hide()
                        } else {
                            onBack()
                        }
                    },
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = if (query.isNotEmpty()) YtmIcons.ArrowLeft24 else YtmIcons.SearchOutline,
                        contentDescription = if (query.isNotEmpty()) "Clear search" else "Back",
                        tint = if (query.isNotEmpty()) TidalPureWhite else TidalCyan,
                        modifier = Modifier.size(20.dp)
                    )
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 4.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    if (query.isEmpty()) {
                        Text(
                            text = "Search Hi-Res tracks, albums, artists, NAS...",
                            fontSize = 14.sp,
                            color = TidalGrey06,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        singleLine = true,
                        textStyle = TextStyle(
                            color = TidalPureWhite,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium
                        ),
                        cursorBrush = SolidColor(TidalCyan),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(
                            onSearch = {
                                keyboard?.hide()
                                executeSearchNow(query)
                            }
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .onFocusChanged { isInputFocused = it.isFocused }
                    )
                }

                if (query.isNotEmpty()) {
                    IconButton(
                        onClick = { query = "" },
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = YtmIcons.CloseX24,
                            contentDescription = "Clear",
                            tint = TidalGrey04,
                            modifier = Modifier.size(19.dp)
                        )
                    }
                } else {
                    IconButton(
                        onClick = {
                            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                                putExtra(
                                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                                )
                                putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                                putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak song or artist name")
                            }
                            try {
                                voiceLauncher.launch(intent)
                            } catch (_: Exception) {
                                Toast.makeText(
                                    context,
                                    "Voice search not available on this device",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        },
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = YtmIcons.Mic24,
                            contentDescription = "Voice search",
                            tint = TidalGrey04,
                            modifier = Modifier.size(19.dp)
                        )
                    }
                }
            }

            if (isSearching) {
                Spacer(modifier = Modifier.height(6.dp))
                LinearProgressIndicator(
                    color = TidalCyan,
                    trackColor = TidalCard,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .clip(RoundedCornerShape(1.dp))
                )
            }
        }

        if (query.isBlank()) {
            // EXPLORE STATE
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = MaxContentWidthDp.dp),
                contentPadding = PaddingValues(bottom = bottomPadding + 28.dp)
            ) {
                // Recent Searches & Trending Keywords
                val trendingTerms = preSearch?.trendingKeywords.orEmpty()
                if (searchHistory.isNotEmpty() || trendingTerms.isNotEmpty()) {
                    item {
                        Column(modifier = Modifier.padding(top = 6.dp, bottom = 12.dp)) {
                            if (searchHistory.isNotEmpty()) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = horizontalGutter, vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Recent searches",
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TidalPureWhite
                                    )
                                    Text(
                                        text = "Clear",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = TidalCyanAccent,
                                        modifier = Modifier.clickable {
                                            searchHistory = emptyList()
                                            saveSearchHistory(historyPrefs, emptyList())
                                        }
                                    )
                                }
                                LazyRow(
                                    contentPadding = PaddingValues(horizontal = horizontalGutter, vertical = 6.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(searchHistory) { term ->
                                        KeywordPill(
                                            text = term,
                                            isAccent = false,
                                            onClick = {
                                                query = term
                                                executeSearchNow(term)
                                            }
                                        )
                                    }
                                }
                            }

                            if (trendingTerms.isNotEmpty()) {
                                Text(
                                    text = "Trending keywords",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TidalPureWhite,
                                    modifier = Modifier.padding(horizontal = horizontalGutter, vertical = 6.dp)
                                )
                                LazyRow(
                                    contentPadding = PaddingValues(horizontal = horizontalGutter, vertical = 2.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(trendingTerms) { kw ->
                                        KeywordPill(
                                            text = kw,
                                            isAccent = true,
                                            onClick = {
                                                query = kw
                                                executeSearchNow(kw)
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // New Releases Horizontal Row
                if (newReleaseAlbums.isNotEmpty()) {
                    item {
                        Text(
                            text = "New Hi-Res releases",
                            fontSize = 19.sp,
                            fontWeight = FontWeight.Bold,
                            color = TidalPureWhite,
                            modifier = Modifier.padding(
                                horizontal = horizontalGutter,
                                vertical = 10.dp
                            )
                        )
                        val cardSize = if (windowState.isWide) 168.dp else 142.dp
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(newReleaseAlbums, key = { "exp_alb_${it.id}_${it.title}" }) { album ->
                                Column(
                                    modifier = Modifier
                                        .width(cardSize)
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable { onAlbumClick(album) }
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(cardSize)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(TidalCard)
                                    ) {
                                        AsyncImage(
                                            model = RetrofitClient.resolveCoverUrl(album.coverUrl),
                                            contentDescription = album.title,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                        Box(
                                            modifier = Modifier
                                                .align(Alignment.TopEnd)
                                                .padding(6.dp)
                                        ) {
                                            QualityBadgePill(text = "MAX", isMax = true)
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = album.title,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = TidalPureWhite,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = album.artist,
                                        fontSize = 12.sp,
                                        color = TidalGrey05,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }

                // Moods & Genres Adaptive Grid (2 / 3 / 4 columns)
                item {
                    Text(
                        text = "Moods & genres",
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        color = TidalPureWhite,
                        modifier = Modifier.padding(
                            start = horizontalGutter,
                            end = horizontalGutter,
                            top = 22.dp,
                            bottom = 10.dp
                        )
                    )
                }

                val moodRows = TIDAL_MOOD_GENRES.chunked(windowState.moodGridColumns)
                items(moodRows) { rowItems ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = horizontalGutter, vertical = 5.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        rowItems.forEach { tile ->
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = TidalCard,
                                border = BorderStroke(0.6.dp, TidalWhite15),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(54.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        query = tile.query
                                        executeSearchNow(tile.query)
                                    }
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .width(6.dp)
                                            .fillMaxHeight()
                                            .background(tile.accentColor)
                                    )
                                    Text(
                                        text = tile.title,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TidalPureWhite,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.padding(horizontal = 12.dp)
                                    )
                                }
                            }
                        }
                        repeat(windowState.moodGridColumns - rowItems.size) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }

                // Featured Artists in Explore
                if (exploreArtists.isNotEmpty()) {
                    item {
                        Text(
                            text = "Top artists",
                            fontSize = 19.sp,
                            fontWeight = FontWeight.Bold,
                            color = TidalPureWhite,
                            modifier = Modifier.padding(
                                start = horizontalGutter,
                                end = horizontalGutter,
                                top = 22.dp,
                                bottom = 10.dp
                            )
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = horizontalGutter),
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            items(exploreArtists, key = { "exp_art_${it.name}" }) { artist ->
                                Column(
                                    modifier = Modifier
                                        .width(96.dp)
                                        .clickable { onArtistClick(artist) },
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(84.dp)
                                            .clip(CircleShape)
                                            .background(TidalCard)
                                            .border(1.dp, TidalCyanAccent.copy(alpha = 0.4f), CircleShape)
                                    ) {
                                        AsyncImage(
                                            model = RetrofitClient.resolveCoverUrl(artist.displayPhoto),
                                            contentDescription = artist.name,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = artist.name,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = TidalPureWhite,
                                        textAlign = TextAlign.Center,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }

                // Trending Tracks
                if (exploreQuickPicks.isNotEmpty()) {
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(
                                    start = horizontalGutter,
                                    end = horizontalGutter,
                                    top = 24.dp,
                                    bottom = 8.dp
                                ),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Trending Hi-Res tracks",
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite
                            )
                            Text(
                                text = "Play all",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TidalCyan,
                                modifier = Modifier.clickable {
                                    exploreQuickPicks.firstOrNull()?.let { first ->
                                        onTrackPlay(first, exploreQuickPicks)
                                    }
                                }
                            )
                        }
                    }

                    AdaptiveTrackGridItems(
                        tracks = exploreQuickPicks.take(20),
                        columns = windowState.libraryGridColumns,
                        likedIds = likedIds,
                        horizontalGutter = horizontalGutter,
                        onTrackClick = { t -> onTrackPlay(t, exploreQuickPicks) }
                    )
                }
            }
        } else {
            // ACTIVE SEARCH RESULTS STATE
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = MaxContentWidthDp.dp)
            ) {
                // Filter Tabs Row
                LazyRow(
                    contentPadding = PaddingValues(horizontal = horizontalGutter, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(SearchTab.entries) { tab ->
                        val active = activeTab == tab
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (active) TidalPureWhite else TidalWhite10,
                            border = if (!active) BorderStroke(0.8.dp, TidalWhite15) else null,
                            modifier = Modifier
                                .height(32.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { activeTab = tab }
                        ) {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier.padding(horizontal = 13.dp)
                            ) {
                                Text(
                                    text = tab.label,
                                    fontSize = 12.sp,
                                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                    color = if (active) TidalPureBlack else TidalWhite
                                )
                            }
                        }
                    }
                }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = bottomPadding + 28.dp)
                ) {
                    // Matching Artists section
                    val showArtists = (activeTab == SearchTab.ALL || activeTab == SearchTab.ARTISTS) &&
                        searchResult.artists.isNotEmpty()
                    if (showArtists) {
                        item {
                            Text(
                                text = "Artists",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite,
                                modifier = Modifier.padding(
                                    horizontal = horizontalGutter,
                                    vertical = 10.dp
                                )
                            )
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = horizontalGutter),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(searchResult.artists) { artist ->
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = TidalCard,
                                        border = BorderStroke(0.8.dp, TidalWhite15),
                                        modifier = Modifier
                                            .width(200.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .clickable { onArtistClick(artist) }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            AsyncImage(
                                                model = RetrofitClient.resolveCoverUrl(artist.displayPhoto),
                                                contentDescription = artist.name,
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier
                                                    .size(48.dp)
                                                    .clip(CircleShape)
                                                    .background(TidalSurface)
                                            )
                                            Spacer(modifier = Modifier.width(10.dp))
                                            Column {
                                                Text(
                                                    text = artist.name,
                                                    fontSize = 14.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = TidalPureWhite,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Text(
                                                    text = artist.displayFollowers,
                                                    fontSize = 11.sp,
                                                    color = TidalCyanAccent,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Matching Albums section
                    val showAlbums = (activeTab == SearchTab.ALL || activeTab == SearchTab.ALBUMS) &&
                        searchResult.albums.isNotEmpty()
                    if (showAlbums) {
                        item {
                            Text(
                                text = "Albums",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                color = TidalPureWhite,
                                modifier = Modifier.padding(
                                    start = horizontalGutter,
                                    end = horizontalGutter,
                                    top = 16.dp,
                                    bottom = 8.dp
                                )
                            )
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = horizontalGutter),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(searchResult.albums) { album ->
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = TidalCard,
                                        modifier = Modifier
                                            .width(140.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .clickable { onAlbumClick(album) }
                                    ) {
                                        Column(modifier = Modifier.padding(8.dp)) {
                                            AsyncImage(
                                                model = RetrofitClient.resolveCoverUrl(album.coverUrl),
                                                contentDescription = album.title,
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier
                                                    .size(124.dp)
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .background(TidalSurface)
                                            )
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Text(
                                                text = album.title,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = TidalPureWhite,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Text(
                                                text = album.artist,
                                                fontSize = 11.sp,
                                                color = TidalGrey05,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Songs section
                    if (displaySongs.isNotEmpty()) {
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(
                                        start = horizontalGutter,
                                        end = horizontalGutter,
                                        top = 18.dp,
                                        bottom = 6.dp
                                    ),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Songs (${displaySongs.size})",
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TidalPureWhite
                                )
                                Text(
                                    text = "Play all",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TidalCyan,
                                    modifier = Modifier.clickable {
                                        displaySongs.firstOrNull()?.let { first ->
                                            onTrackPlay(first, displaySongs)
                                        }
                                    }
                                )
                            }
                        }

                        AdaptiveTrackGridItems(
                            tracks = displaySongs,
                            columns = windowState.libraryGridColumns,
                            likedIds = likedIds,
                            horizontalGutter = horizontalGutter,
                            onTrackClick = { t -> onTrackPlay(t, displaySongs) }
                        )
                    } else if (hasSearched && !isSearching && !showAlbums && !showArtists) {
                        item {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 64.dp, horizontal = 24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    imageVector = YtmIcons.SearchOutline,
                                    contentDescription = null,
                                    tint = TidalGrey08,
                                    modifier = Modifier.size(44.dp)
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = "No matching lossless tracks for \"$query\"",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TidalPureWhite,
                                    textAlign = TextAlign.Center
                                )
                                Text(
                                    text = "Try switching filter tabs or searching artist/album keywords.",
                                    fontSize = 13.sp,
                                    color = TidalGrey05,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KeywordPill(
    text: String,
    isAccent: Boolean,
    onClick: () -> Unit
) {
    Surface(
        shape = CircleShape,
        color = if (isAccent) TidalCyanDim else TidalCard,
        border = BorderStroke(
            0.8.dp,
            if (isAccent) TidalCyanAccent.copy(alpha = 0.5f) else TidalWhite15
        ),
        modifier = Modifier
            .clip(CircleShape)
            .clickable { onClick() }
    ) {
        Text(
            text = text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = if (isAccent) TidalCyan else TidalGrey02,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.AdaptiveTrackGridItems(
    tracks: List<Track>,
    columns: Int,
    likedIds: Set<String>,
    horizontalGutter: Dp,
    onTrackClick: (Track) -> Unit
) {
    if (columns <= 1) {
        items(tracks.size, key = { idx -> "s_${idx}_${tracks[idx].id}" }) { idx ->
            val track = tracks[idx]
            Box(modifier = Modifier.padding(horizontal = (horizontalGutter - 16.dp).coerceAtLeast(0.dp))) {
                TrackListItem(
                    track = track,
                    isLiked = likedIds.contains(track.id),
                    onTrackClick = { onTrackClick(track) },
                    queue = tracks
                )
            }
        }
    } else {
        val paired = tracks.chunked(2)
        items(paired.size, key = { r -> "sg_${r}_${paired[r].first().id}" }) { rowIdx ->
            val pair = paired[rowIdx]
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = (horizontalGutter - 16.dp).coerceAtLeast(0.dp)),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                pair.forEach { track ->
                    Box(modifier = Modifier.weight(1f)) {
                        TrackListItem(
                            track = track,
                            isLiked = likedIds.contains(track.id),
                            onTrackClick = { onTrackClick(track) },
                            queue = tracks
                        )
                    }
                }
                if (pair.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

private fun TidalSearchItem.toTrack(): Track {
    val resolvedFormat = format?.takeIf { it.isNotBlank() } ?: if (hires) "FLAC" else "AAC"
    val resolvedBitDepth = bitDepth ?: if (resolvedFormat.equals("FLAC", ignoreCase = true)) {
        if (hires) 24 else 16
    } else 16
    val resolvedSampleRate = sampleRate?.toInt() ?: if (hires) 96000 else 44100
    return Track(
        id = id.ifBlank { "${artist}-${title}".hashCode().toString() },
        title = title,
        artist = artist,
        album = album,
        duration = duration,
        coverUrl = RetrofitClient.resolveCoverUrl(coverUrl),
        url = previewUrl?.let { RetrofitClient.resolveCoverUrl(it) }.orEmpty(),
        streamId = streamId,
        source = source,
        hires = hires,
        bitDepth = resolvedBitDepth,
        sampleRate = resolvedSampleRate,
        bitrate = bitrate,
        format = resolvedFormat.uppercase(),
        drScore = drScore,
        codec = resolvedFormat.uppercase()
    )
}

private fun readSearchHistory(prefs: android.content.SharedPreferences): List<String> {
    val raw = prefs.getString("queries_json", null) ?: return emptyList()
    return runCatching {
        val arr = JSONArray(raw)
        List(arr.length()) { idx -> arr.optString(idx) }.filter { it.isNotBlank() }
    }.getOrDefault(emptyList())
}

private fun saveSearchHistory(prefs: android.content.SharedPreferences, items: List<String>) {
    val arr = JSONArray()
    items.forEach { arr.put(it) }
    prefs.edit().putString("queries_json", arr.toString()).apply()
}
