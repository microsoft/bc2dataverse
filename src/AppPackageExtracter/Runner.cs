namespace AppPackageExtracter
{
    using System;
    using System.Linq;
    using io = System.IO;
    using coll = System.Collections.Generic;
    using thread = System.Threading.Tasks;

    internal class Runner
    {
        public coll.List<string> PackagePaths { get; private set; }
        public CommandLineArgs Args { get; private set; }

        public Runner(CommandLineArgs args)
        {
            this.Args = args;
            this.PackagePaths = new coll.List<string>();
            var parts = this.Args.PackagesPath.Split('|');
            foreach (var part in parts)
            {
                if (!string.IsNullOrEmpty(part))
                {
                    this.PackagePaths.Add(part.Trim(' ', '"'));
                }
            }
            this.Args.RelativeFilePath = args.RelativeFilePath.Trim(' ', '"');
            this.Args.BcDllFolderPath = args.BcDllFolderPath.Trim(' ', '"');
            this.Args.CacheFolder = args.CacheFolder.Trim(' ', '"');
            if (!io.Directory.Exists(this.Args.CacheFolder))
            {
                throw new Exception($"Folder {args.CacheFolder} does not exist.");
            }
        }

        public void Start()
        {
            try
            {
                var tasks = new coll.List<thread.Task>();

                using (var manifest = new Manifest(this.Args.CacheFolder))
                {
                    foreach (var packagePath in this.PackagePaths)
                    {
                        var task = new thread.Task(() =>
                        {
                            var result = this.processAppPackage(packagePath, manifest);
                        });
                        task.Start();
                        tasks.Add(task);
                    }
                    thread.Task.WaitAll(tasks.ToArray());
                }
            }
            catch (AggregateException e)
            {
                Console.WriteLine($"{e.InnerExceptions.Count} error occured.");
                Console.WriteLine("Showing first exception only...");
                Console.WriteLine(e.InnerExceptions.First());
            }
        }

        private string processAppPackage(string packagePath, Manifest manifest)
        {
            var path = new ExtracterTask
            {
                CacheFolder = this.Args.CacheFolder,
                PackagePath = packagePath,
            }.GetPathToFile(this.Args.RelativeFilePath, manifest, this.Args.BcDllFolderPath);
            Console.WriteLine($"File extracted: {path}");
            return path;
        }
    }
}