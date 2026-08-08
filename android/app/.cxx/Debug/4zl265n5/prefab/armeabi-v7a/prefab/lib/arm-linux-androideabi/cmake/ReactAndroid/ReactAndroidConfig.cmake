if(NOT TARGET ReactAndroid::hermestooling)
add_library(ReactAndroid::hermestooling SHARED IMPORTED)
set_target_properties(ReactAndroid::hermestooling PROPERTIES
    IMPORTED_LOCATION "/home/rcherki10/.gradle/caches/8.14.5/transforms/a2fbbe8028e0ba7f3b73d47cf2f952c4/transformed/react-android-0.81.5-debug/prefab/modules/hermestooling/libs/android.armeabi-v7a/libhermestooling.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/rcherki10/.gradle/caches/8.14.5/transforms/a2fbbe8028e0ba7f3b73d47cf2f952c4/transformed/react-android-0.81.5-debug/prefab/modules/hermestooling/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::jsi)
add_library(ReactAndroid::jsi SHARED IMPORTED)
set_target_properties(ReactAndroid::jsi PROPERTIES
    IMPORTED_LOCATION "/home/rcherki10/.gradle/caches/8.14.5/transforms/a2fbbe8028e0ba7f3b73d47cf2f952c4/transformed/react-android-0.81.5-debug/prefab/modules/jsi/libs/android.armeabi-v7a/libjsi.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/rcherki10/.gradle/caches/8.14.5/transforms/a2fbbe8028e0ba7f3b73d47cf2f952c4/transformed/react-android-0.81.5-debug/prefab/modules/jsi/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::reactnative)
add_library(ReactAndroid::reactnative SHARED IMPORTED)
set_target_properties(ReactAndroid::reactnative PROPERTIES
    IMPORTED_LOCATION "/home/rcherki10/.gradle/caches/8.14.5/transforms/a2fbbe8028e0ba7f3b73d47cf2f952c4/transformed/react-android-0.81.5-debug/prefab/modules/reactnative/libs/android.armeabi-v7a/libreactnative.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/rcherki10/.gradle/caches/8.14.5/transforms/a2fbbe8028e0ba7f3b73d47cf2f952c4/transformed/react-android-0.81.5-debug/prefab/modules/reactnative/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

