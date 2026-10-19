plugins { id("com.android.application") }
android {
    namespace = "com.cwtrainer.pocket"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.cwtrainer.pocket"
        minSdk = 26
        targetSdk = 34
        versionCode = 12
        versionName = "0.5.2"
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
}
