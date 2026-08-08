if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/home/rcherki10/.gradle/caches/8.14.5/transforms/524bdf438d0931912d278c57c3650217/transformed/hermes-android-0.81.5-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/rcherki10/.gradle/caches/8.14.5/transforms/524bdf438d0931912d278c57c3650217/transformed/hermes-android-0.81.5-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

