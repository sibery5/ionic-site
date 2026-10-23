plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun configValue(name: String): String = providers.gradleProperty(name).get().trim()

// gradle.properties'teki değeri BuildConfig için Java string sabitine çevirir
fun javaString(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val releaseSiteUrl = configValue("dramaseason.siteUrl.release")

android {
    namespace = "com.dramaseason.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.dramaseason.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "ADMIN_PATHS", javaString(configValue("dramaseason.adminPaths")))
        buildConfigField("String", "IN_APP_HOSTS", javaString(configValue("dramaseason.inAppHosts")))
    }

    buildTypes {
        debug {
            buildConfigField("String", "SITE_URL", javaString(configValue("dramaseason.siteUrl.debug")))
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "SITE_URL", javaString(releaseSiteUrl))
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

// Canlı site adresi girilmeden yayın sürümü derlenmesin
val checkReleaseSiteUrl by tasks.registering {
    val url = releaseSiteUrl
    doLast {
        if (url.contains("SITENIZ") || !url.startsWith("https://")) {
            throw GradleException(
                "gradle.properties içindeki dramaseason.siteUrl.release değerine canlı sitenizin " +
                    "https:// adresini yazın (şu an: $url)",
            )
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(checkReleaseSiteUrl) }
