use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use tracing::warn;

pub fn ensure_dir_permissions<P: AsRef<Path>>(path: P, puid: u32, pgid: u32) {
    let p = path.as_ref();
    if let Err(e) = fs::create_dir_all(p) {
        warn!("Failed to create dir {}: {}", p.display(), e);
        return;
    }

    // Set rwxrwxr-x (775)
    let _ = fs::set_permissions(p, fs::Permissions::from_mode(0o775));

    // Try chown on Linux if running as privileged
    #[cfg(target_os = "linux")]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;
        if let Ok(c_path) = CString::new(p.as_os_str().as_bytes()) {
            unsafe {
                libc::chown(c_path.as_ptr(), puid, pgid);
            }
        }
    }
}

pub fn ensure_file_permissions<P: AsRef<Path>>(path: P, puid: u32, pgid: u32) {
    let p = path.as_ref();
    // Set rw-rw-r-- (664)
    let _ = fs::set_permissions(p, fs::Permissions::from_mode(0o664));

    #[cfg(target_os = "linux")]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;
        if let Ok(c_path) = CString::new(p.as_os_str().as_bytes()) {
            unsafe {
                libc::chown(c_path.as_ptr(), puid, pgid);
            }
        }
    }
}
