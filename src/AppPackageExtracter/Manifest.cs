namespace AppPackageExtracter
{
    using System;
    using coll = System.Collections.Generic;
    using io = System.IO;
    using json = Newtonsoft.Json;

    internal class Manifest : IDisposable
    {
        private string Path;
        private coll.List<Entry> Entries;
        private static readonly Object lockObj = new Object();

        public Manifest(string containingFolderPath)
        {
            this.Path = io.Path.Combine(containingFolderPath, "manifest.json");
            this.Entries = this.getEntries();
        }

        public void Add(string packagePath, string relativePath, string extractedPath)
        {
            lock (lockObj)
            {
                var fp = new Entry.FilePath
                {
                    relativePath = relativePath,
                    extracted = extractedPath
                };

                if (!this.tryFindEntry(packagePath, out Entry found))
                {
                    var entry = new Entry
                    {
                        appPackage = packagePath,
                        extractedAt = DateTime.UtcNow,
                        files = new coll.List<Entry.FilePath>()
                    };
                    entry.files.Add(fp);
                    this.Entries.Add(entry);

                    return;
                }

                found.AddFile(fp);
            }
        }

        public bool TryGetCachePath(string packagePath, string relativePath, out string cachePath)
        {
            cachePath = string.Empty;
            if (!this.tryFindEntry(packagePath, out Entry found))
            {
                return false;
            }
            var lastModified = io.File.GetLastWriteTimeUtc(packagePath);
            var entryTooOld = found.extractedAt < lastModified;
            if (entryTooOld)
            {
                foreach (var f in found.files)
                {
                    try
                    {
                        io.File.Delete(f.extracted); // clean up old files
                    }
                    catch
                    {
                        Console.WriteLine($"Could not delete obsolete file: {f.extracted}");
                    }
                }
                this.Entries.Remove(found);
                return false;
            }
            if (found.TryFindCache(relativePath, out cachePath))
            {
                if (io.File.Exists(cachePath))
                {
                    return true;
                }
            }
            return false;
        }

        void IDisposable.Dispose()
        {
            this.saveEntries();
        }

        private bool tryFindEntry(string packagePath, out Entry entry)
        {
#pragma warning disable CS8601
            entry = this.Entries.Find(f => f.appPackage.ToLowerInvariant() == packagePath.ToLowerInvariant());
#pragma warning restore CS8601
            return entry != default(Entry);
        }

        private coll.List<Entry> getEntries()
        {
            if (io.File.Exists(this.Path))
            {
                using (var reader = new io.StreamReader(new io.FileStream(this.Path, io.FileMode.Open, io.FileAccess.Read)))
                {
                    var body = reader.ReadToEnd();
                    var entries = json.JsonConvert.DeserializeObject<coll.List<Entry>>(body);
                    return entries ?? new coll.List<Entry>();
                }
            }
            return new coll.List<Entry>();
        }

        private void saveEntries()
        {
            io.File.Delete(this.Path);
            using (var writer = new io.StreamWriter(new io.FileStream(this.Path, io.FileMode.Create, io.FileAccess.Write)))
            {
                var toWrite = json.JsonConvert.SerializeObject(this.Entries, json.Formatting.Indented, new json.JsonSerializerSettings
                {
                    DateTimeZoneHandling = json.DateTimeZoneHandling.Utc
                });
                writer.Write(toWrite);
            }
        }

        private class Entry
        {
            public string appPackage { get; set; } = string.Empty;
            public DateTime extractedAt { get; set; } = DateTime.MinValue;
            public coll.List<FilePath> files { get; set; } = new coll.List<FilePath>();

            public class FilePath
            {
                public string relativePath { get; set; } = string.Empty;
                public string extracted { get; set; } = string.Empty;
            }

            public void AddFile(FilePath fp)
            {
                var fileList = this.files;
                var filePathWithSameRelativePath = fileList.Find(fp_ => fp_.relativePath == fp.relativePath);
                if (filePathWithSameRelativePath == default(FilePath))
                {
                    fileList.Add(fp);
                }
                else
                {
                    filePathWithSameRelativePath.extracted = fp.extracted;
                }
            }

            public bool TryFindCache(string relativePath, out string cachePath)
            {
                cachePath = string.Empty;
                foreach (var fp in this.files)
                {
                    if (fp.relativePath.ToLowerInvariant() == relativePath.ToLowerInvariant())
                    {
                        cachePath = fp.extracted;
                        return true;
                    }
                }
                return false;
            }
        }
    }
}