use std::path::PathBuf;

/// Parsed CLI options for the `kelp` installer and EGO packager.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Options {
    pub system: bool,
    pub dry_run: bool,
    pub skip_gsettings: bool,
    pub target_dir: Option<PathBuf>,
    pub pack_dir: Option<PathBuf>,
    pub help: bool,
}

/// Parses command-line arguments into [`Options`] without external dependencies.
pub fn parse_args<I>(args: I) -> Result<Options, String>
where
    I: IntoIterator<Item = String>,
{
    let mut opts = Options::default();
    let mut iter = args.into_iter().peekable();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-h" | "--help" => opts.help = true,
            "--system" => opts.system = true,
            "--user" => opts.system = false,
            "--dry-run" => opts.dry_run = true,
            "--skip-gsettings" => opts.skip_gsettings = true,
            "--pack" => {
                let dir = match iter.peek() {
                    Some(next) if !next.starts_with('-') => {
                        let taken = iter.next().unwrap_or_default();
                        if taken.is_empty() {
                            return Err("--pack directory cannot be empty".to_string());
                        }
                        PathBuf::from(taken)
                    }
                    _ => PathBuf::from("."),
                };
                opts.pack_dir = Some(dir);
            }
            "--target-dir" => {
                let dir = iter
                    .next()
                    .ok_or_else(|| "--target-dir requires a path argument".to_string())?;
                if dir.is_empty() {
                    return Err("--target-dir cannot be empty".to_string());
                }
                opts.target_dir = Some(PathBuf::from(dir));
            }
            other => {
                return Err(format!("Unknown argument: {other}"));
            }
        }
    }
    Ok(opts)
}
