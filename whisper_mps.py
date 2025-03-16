import torch
import warnings
import sys
import argparse
import os
import time
import whisper
from whisper.transcribe import cli

# Set up logging
import logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('whisper_mps')

# Log system info
logger.info(f"Python version: {sys.version}")
logger.info(f"PyTorch version: {torch.__version__}")
logger.info(f"MPS available: {torch.backends.mps.is_available()}")
logger.info(f"MPS built: {torch.backends.mps.is_built()}")
logger.info(f"Running on device: {torch.device('mps' if torch.backends.mps.is_available() else 'cpu')}")

# Performance optimization for MPS
if torch.backends.mps.is_available():
    # Enable compute streams for better parallelism
    os.environ['PYTORCH_ENABLE_MPS_STREAM'] = '1'
    logger.info("Enabled MPS compute streams for better parallelism")
    
    # Set memory optimization level
    os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '0.0'  # Use as much memory as needed
    logger.info("Set MPS memory optimization")

# Monkey patch torch.Tensor.to to handle sparse tensors on the MPS backend
_original_to = torch.Tensor.to

def patched_to(self, *args, **kwargs):
    try:
        return _original_to(self, *args, **kwargs)
    except NotImplementedError as e:
        if hasattr(self, 'is_sparse') and self.is_sparse:
            logger.warning(f"Converting sparse tensor to dense for MPS compatibility: {e}")
            return _original_to(self.to_dense(), *args, **kwargs)
        else:
            logger.error(f"NotImplementedError in patched_to: {e}")
            raise e

# Apply the patch
torch.Tensor.to = patched_to
logger.info("Applied patch to torch.Tensor.to for sparse tensor handling")

# Monkey patch torch.nn.Module._apply to handle sparse tensors in module buffers and parameters
_original_apply = torch.nn.Module._apply

def patched_apply(self, fn):
    try:
        return _original_apply(self, fn)
    except NotImplementedError as e:
        error_message = str(e)
        if 'aten::_sparse_coo_tensor_with_dims_and_tensors' in error_message:
            logger.warning(f"Handling sparse tensor in Module._apply: {e}")
            
            # Custom implementation that handles sparse tensors
            for key, param in self._parameters.items():
                if param is not None:
                    try:
                        param_applied = fn(param)
                        self._parameters[key] = param_applied
                    except NotImplementedError:
                        if param.is_sparse:
                            logger.info(f"Converting sparse parameter to dense: {key}")
                            dense_param = param.to_dense()
                            param_applied = fn(dense_param)
                            self._parameters[key] = param_applied
            
            for key, buf in self._buffers.items():
                if buf is not None:
                    try:
                        buf_applied = fn(buf)
                        self._buffers[key] = buf_applied
                    except NotImplementedError:
                        if buf.is_sparse:
                            logger.info(f"Converting sparse buffer to dense: {key}")
                            dense_buf = buf.to_dense()
                            buf_applied = fn(dense_buf)
                            self._buffers[key] = buf_applied
            
            for module in self.children():
                module._apply(fn)
            
            return self
        else:
            raise e

# Apply the Module._apply patch
torch.nn.Module._apply = patched_apply
logger.info("Applied patches for sparse tensor handling")

# Monkey patch whisper's load_model function to optimize for MPS
original_load_model = whisper.load_model

def optimized_load_model(name, device=None, download_root=None, in_memory=False):
    start_time = time.time()
    logger.info(f"Loading model {name} to device {device}")
    
    model = original_load_model(name, device=device, download_root=download_root, in_memory=in_memory)
    
    # If using MPS, ensure model is optimized
    if device == "mps":
        # Ensure model is in eval mode for inference
        model.eval()
        
        # Optimize memory usage
        torch.mps.empty_cache()
        
        # Pre-compile some operations to avoid JIT compilation during inference
        logger.info("Pre-compiling common operations for MPS")
        
    load_time = time.time() - start_time
    logger.info(f"Model loaded in {load_time:.2f} seconds")
    return model

# Apply the patch to whisper's load_model
whisper.load_model = optimized_load_model

# Benchmark function to measure performance
def benchmark_transcription(func, *args, **kwargs):
    start_time = time.time()
    result = func(*args, **kwargs)
    end_time = time.time()
    duration = end_time - start_time
    logger.info(f"Transcription completed in {duration:.2f} seconds")
    return result, duration

def main():
    logger.info(f"Starting whisper_mps with args: {sys.argv}")
    
    # Check if we're using MPS or CPU
    using_mps = False
    for i, arg in enumerate(sys.argv):
        if arg == "--device" and i+1 < len(sys.argv) and sys.argv[i+1] == "mps":
            using_mps = True
            break
        elif arg.startswith("--device=mps"):
            using_mps = True
            break
    
    if using_mps:
        logger.info("Running with MPS (GPU) acceleration")
    else:
        logger.info("Running with CPU")
    
    try:
        # Attempt to run the Whisper CLI from the transcribe module with benchmarking
        if "--benchmark" in sys.argv:
            # Remove the benchmark flag before passing to cli
            sys.argv.remove("--benchmark")
            logger.info("Running in benchmark mode")
            
            # Define a wrapper for cli that we can benchmark
            def run_cli():
                return cli()
                
            result, duration = benchmark_transcription(run_cli)
            return result
        else:
            logger.info("Attempting to run whisper")
            return cli()
    except NotImplementedError as e:
        error_message = str(e)
        logger.error(f"NotImplementedError: {error_message}")
        
        if 'aten::_sparse_coo_tensor_with_dims_and_tensors' in error_message:
            logger.warning("Falling back to CPU due to sparse tensor error")
            # Modify sys.argv to force CPU mode and disable fp16
            args = sys.argv[1:]
            new_args = []
            skip_next = False
            for i, arg in enumerate(args):
                if skip_next:
                    skip_next = False
                    continue
                if arg == '--device':
                    new_args.extend(['--device', 'cpu'])
                    skip_next = True  # skip next value
                elif arg.startswith('--device='):
                    new_args.append('--device=cpu')
                elif arg == '--fp16':
                    new_args.extend(['--fp16', 'False'])
                    skip_next = True
                elif arg.startswith('--fp16='):
                    new_args.append('--fp16=False')
                else:
                    new_args.append(arg)
            sys.argv = [sys.argv[0]] + new_args
            logger.info(f"Retrying with CPU: {sys.argv}")
            return cli()
        else:
            raise e
    except Exception as e:
        logger.error(f"Unexpected error: {type(e).__name__}: {e}")
        raise e

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        logger.error(f"Fatal error: {type(e).__name__}: {e}")
        sys.exit(1) 