namespace AppPackageExtracter
{
    using System;
    using pack = System.IO.Packaging;
    using io = System.IO;
    using refl = System.Reflection;

    internal class ExtracterTask
    {
        public string PackagePath { get; internal set; } = string.Empty;
        public string CacheFolder { get; internal set; } = string.Empty;

        public string GetPathToFile(string relativePath, Manifest manifest, string bcDllFolderPath)
        {
            string cachedPath;
            if (manifest.TryGetCachePath(this.PackagePath, relativePath, out cachedPath))
            {
                return cachedPath;
            }
            cachedPath = this.Extract(relativePath, bcDllFolderPath);
            manifest.Add(this.PackagePath, relativePath, cachedPath);
            return cachedPath;
        }

        private string Extract(string relativePath, string navDllFolderPath)
        {
            using (io.Stream fs = new io.FileStream(this.PackagePath, io.FileMode.Open, io.FileAccess.Read))
            {
                var contentStream = this.getAppPackageContentStream(fs, navDllFolderPath);
                var p = pack.Package.Open(contentStream, io.FileMode.Open, io.FileAccess.Read);
                var partUri = this.createPackagedUri(relativePath);
                var part = p.GetPart(partUri);
                using (var stream = new io.StreamReader(part.GetStream(io.FileMode.Open, io.FileAccess.Read)))
                {
                    var newCachePath = io.Path.Combine(this.CacheFolder, Guid.NewGuid().ToString());
                    using (var writer = new io.StreamWriter(new io.FileStream(newCachePath, io.FileMode.CreateNew, io.FileAccess.Write)))
                    {
                        writer.Write(stream.ReadToEnd());
                        return newCachePath;
                    }
                }
            }
        }

        private io.Stream getAppPackageContentStream(io.Stream packageFileStream, string bcDllFolderPath)
        {
            // Execute
            // var navAppPackage = Microsoft.Dynamics.Nav.CodeAnalysis.Packaging.NavAppPackage.Open(packageFileStream, false);
            // return navAppPackage.ContentStream;
            var contentStreamProvider = this.getContentStreamProvider(bcDllFolderPath, packageFileStream);
            return contentStreamProvider.Invoke();
        }

        const string NavAppNamespace = "Microsoft.Dynamics.Nav.CodeAnalysis";
        const string NavAppPackageTypeName = "Microsoft.Dynamics.Nav.CodeAnalysis.Packaging.NavAppPackage";
        private Func<io.Stream> getContentStreamProvider(string bcDllFolderPath, io.Stream packageStream)
        {
            Type navAppPackageType = Type.GetType(ExtracterTask.NavAppPackageTypeName);
            if (navAppPackageType == null)
            {
                var dll = io.Path.Combine(bcDllFolderPath, $"{ExtracterTask.NavAppNamespace}.dll");
                var assembly = refl.Assembly.LoadFrom(dll);
                navAppPackageType = assembly.GetType(ExtracterTask.NavAppPackageTypeName);
            }
            if (navAppPackageType == null)
            {
                throw new Exception("The DLL path provided does not have the needed type Microsoft.Dynamics.Nav.CodeAnalysis.Packaging.NavAppPackage.");
            }
            return () =>
            {
                try
                {
                    var methodInfo = navAppPackageType.GetMethod("Open");
                    if (methodInfo == null)
                    {
                        throw new Exception("Method Open not found in type.");
                    }
                    object appPackage = methodInfo.Invoke(null, new object[] { packageStream, false, null });
                    if (appPackage == null)
                    {
                        throw new Exception("Calling Open returned null.");
                    }
                    var returned = navAppPackageType.GetProperty("ContentStream")?.GetValue(appPackage);
                    if (returned == null)
                    {
                        throw new Exception("No content found inside app package.");
                    }
                    return (io.Stream)returned;
                }
                catch (Exception e)
                {
                    throw new Exception("Unexpected error occured when getting the content stream from the app package.", e);
                }
            };
        }

        private Uri createPackagedUri(string path)
        {
            string encodedPath = path; //Uri.EscapeUriString(path.Replace('\\', '/'));
            Uri uri = new Uri(path[0] == '/' ? encodedPath : '/' + encodedPath, UriKind.Relative);

            return pack.PackUriHelper.CreatePartUri(uri);
        }

    }
}
