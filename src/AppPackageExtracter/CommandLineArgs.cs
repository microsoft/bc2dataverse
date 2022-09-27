namespace AppPackageExtracter
{
    using System;

    internal class CommandLineArgs
    {
        public string PackagesPath { get; internal set; } = string.Empty;
        public string CacheFolder { get; internal set; } = string.Empty;
        public string RelativeFilePath { get; internal set; } = string.Empty;
        public string BcDllFolderPath { get; internal set; } = string.Empty;

        private CommandLineArgs()
        {
        }

        public static CommandLineArgs Parse(string[] args)
        {
            string appPackagePath = null, cachePath = null, relativeFilePath = null, bcDllFolderPath = null;
            foreach (string arg in args)
            {
                if (CommandLineArgs.tryGetNameValue(arg, out string name, out string value))
                {
                    switch (name)
                    {
                        case "packagesPath":
                            appPackagePath = value;
                            break;
                        case "relativeFilePath":
                            relativeFilePath = value;
                            break;
                        case "cacheFolder":
                            cachePath = value;
                            break;
                        case "bcDllFolderPath":
                            bcDllFolderPath = value;
                            break;
                    }
                }
            }

            if (appPackagePath == null || relativeFilePath == null || cachePath == null || bcDllFolderPath == null)
            {
                throw new Exception("No arguments or arguments in invalid format passed.");
            }
            return new CommandLineArgs
            {
                PackagesPath = appPackagePath,
                RelativeFilePath = relativeFilePath,
                CacheFolder = cachePath,
                BcDllFolderPath = bcDllFolderPath
            };
        }

        private static bool tryGetNameValue(string arg, out string name, out string value)
        {
            int colon = arg.IndexOf(':');
            if ((arg.Length <= 1) || (colon < 0) || (!arg.StartsWith("-")))
            {
                name = null;
                value = null;
                return false;
            }

            name = arg.Substring(1, colon - 1);
            value = arg.Substring(colon + 1);
            return true;
        }
    }
}