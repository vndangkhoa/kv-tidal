package com.kvtidal.app.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.model.TidalLibrarySummaryResponse
import com.kvtidal.app.data.model.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext

class AuthRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("kv_tidal_auth", Context.MODE_PRIVATE)
    private val api get() = RetrofitClient.getApi()

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser

    private val _isServerOnline = MutableStateFlow(false)
    val isServerOnline: StateFlow<Boolean> = _isServerOnline

    private val _serverLatencyMs = MutableStateFlow<Long?>(null)
    val serverLatencyMs: StateFlow<Long?> = _serverLatencyMs

    private val _librarySummary = MutableStateFlow<TidalLibrarySummaryResponse?>(null)
    val librarySummary: StateFlow<TidalLibrarySummaryResponse?> = _librarySummary

    init {
        val savedUser = prefs.getString("subsonic_user", null)
        if (!savedUser.isNullOrBlank()) {
            _currentUser.value = User(
                id = savedUser,
                name = savedUser,
                email = "${RetrofitClient.getBaseUrl()} • OpenSubsonic"
            )
        }
    }

    suspend fun refreshServerStatus(): Result<TidalLibrarySummaryResponse> = withContext(Dispatchers.IO) {
        val start = System.currentTimeMillis()
        try {
            val res = api.getLibrarySummary()
            val latency = (System.currentTimeMillis() - start).coerceAtLeast(1L)
            _serverLatencyMs.value = latency
            if (res.isSuccessful && res.body() != null) {
                val summary = res.body()!!
                _isServerOnline.value = true
                _librarySummary.value = summary
                val uname = summary.subsonicUser.ifBlank { "NAS Listener" }
                prefs.edit().putString("subsonic_user", uname).apply()
                _currentUser.value = User(
                    id = uname,
                    name = uname,
                    email = "${RetrofitClient.getBaseUrl()} • ${summary.totalTracks} tracks"
                )
                Result.success(summary)
            } else {
                _isServerOnline.value = false
                Result.failure(Exception("Server HTTP ${res.code()}"))
            }
        } catch (e: Exception) {
            _isServerOnline.value = false
            Result.failure(e)
        }
    }

    fun setLocalProfileName(name: String) {
        val clean = name.trim().ifBlank { "Audiophile" }
        prefs.edit().putString("subsonic_user", clean).apply()
        _currentUser.value = User(
            id = clean,
            name = clean,
            email = RetrofitClient.getBaseUrl()
        )
    }

    fun logout() {
        prefs.edit().clear().apply()
        _currentUser.value = null
    }
}
