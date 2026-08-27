# Android tools are grouped so a relocation affects one root rather than a
# scattered collection of exports. ANDROID_HOME takes precedence when both
# compatible environment variables are supplied.
typeset mzsh_android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -n $mzsh_android_home ]]; then
  mzsh_path_add_application "$mzsh_android_home/emulator"
  mzsh_path_add_application "$mzsh_android_home/platform-tools"
  mzsh_path_add_application "$mzsh_android_home/cmdline-tools/latest/bin"
fi
unset mzsh_android_home
