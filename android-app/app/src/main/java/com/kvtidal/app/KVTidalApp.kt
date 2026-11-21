package com.kvtidal.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.kvtidal.app.data.api.RetrofitClient
import com.kvtidal.app.data.download.OfflineDownloadManager
import com.kvtidal.app.data.repository.AuthRepository
import com.kvtidal.app.data.repository.MusicRepository
import com.kvtidal.app.player.AudioCacheManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

class KVTidalApp : Application(), ImageLoaderFactory {

    lateinit var musicRepository: MusicRepository
        private set

    lateinit var authRepository: AuthRepository
        private set

    private val appIoScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onCreate() {
        super.onCreate()
        instance = this
        RetrofitClient.init(this)
        OfflineDownloadManager.init(this)
        musicRepository = MusicRepository(this)
        authRepository = AuthRepository(this)

        appIoScope.launch {
            runCatching { AudioCacheManager.getCache(this@KVTidalApp) }
            RetrofitClient.prewarmConnection()
            authRepository.refreshServerStatus()
        }
    }

    override fun newImageLoader(): ImageLoader {
        val okHttpClient = OkHttpClient.Builder()
            .connectionPool(RetrofitClient.sharedConnectionPool)
            .followRedirects(true)
            .followSslRedirects(true)
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .header("User-Agent", "KVTidal-Android/1.0.0")
                    .build()
                chain.proceed(request)
            }
            .build()

        return ImageLoader.Builder(this)
            .okHttpClient(okHttpClient)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.25)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(120L * 1024L * 1024L)
                    .build()
            }
            .crossfade(true)
            .respectCacheHeaders(false)
            .build()
    }

    companion object {
        lateinit var instance: KVTidalApp
            private set
    }
}
