# R8 rules for release builds.
#
# React Native, WorkManager and part of ML Kit ship their own consumer rules inside their AARs, so
# they are deliberately not repeated here. What follows covers only the gaps those leave — every one
# of them is a lookup that happens by name at runtime, which R8 cannot see and which therefore fails
# only in a release build.

# --- Nitro (react-native-mmkv, react-native-nitro-sqlite) -----------------------------------------
# These packages ship no consumer rules at all, and their C++ side resolves the Kotlin classes by
# fully-qualified name over JNI. Renaming or removing any of them breaks the database and the key
# value store at startup, so the namespace is kept whole.
-keep class com.margelo.nitro.** { *; }
-keepclassmembers class com.margelo.nitro.** { *; }

# Parts of Nitro are marked with Fresco's DoNotStrip rather than React Native's. RN's consumer rules
# only cover com.facebook.proguard.annotations and com.facebook.jni.annotations, so this third
# annotation would otherwise be ignored.
-keep @com.facebook.common.internal.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.common.internal.DoNotStrip *;
}

# --- ML Kit ---------------------------------------------------------------------------------------
# text-recognition and mlkit-common ship consumer rules; image-labeling, vision-common and the
# labeling model artifacts do not. Detectors and their bundled models are resolved by name through
# the ML Kit registry, so the reflection is invisible to R8.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-dontwarn com.google.mlkit.**

# --- Recall's own reflective entry points ---------------------------------------------------------
# WorkManager persists the worker's class name in its database and instantiates it reflectively on
# the next run. androidx.work's consumer rule is -keepnames, which prevents renaming but still allows
# removal, so the worker is kept outright along with the constructor WorkerFactory calls.
-keep class com.recallai.screenshots.RecallIndexWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# The native module itself is already covered by React Native's
# "-keep class * implements com.facebook.react.bridge.NativeModule" consumer rule, which keeps every
# @ReactMethod on it. No app-level rule is needed for it.

# --- Diagnostics ----------------------------------------------------------------------------------
# Obfuscation is kept on, so release stack traces are mapped. mapping.txt is written to
# app/build/outputs/mapping/release/ and is the only way to read a production crash report — keep it
# for any build that is actually distributed.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
