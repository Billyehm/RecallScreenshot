if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/home/rcherki10/.gradle/caches/8.14.5/transforms/f817c3557173a6596f85ce9cbf519e05/transformed/hermes-android-0.81.5-release/prefab/modules/libhermes/libs/android.x86/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/rcherki10/.gradle/caches/8.14.5/transforms/f817c3557173a6596f85ce9cbf519e05/transformed/hermes-android-0.81.5-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

